import { useCallback, useEffect, useState } from 'react';
import { Form, message } from 'antd';
import { apiClient } from '../../api/client';
import type { useTranslation } from '../../shared/hooks/useTranslation';
import type {
  IncidentEntry,
  SelfTestResult,
  SupportFeedbackEntry,
  SupportFeedbackResult,
  SupportIncidentsResult,
  SupportStatus,
} from '../../../shared/contracts';
import {
  buildSupportSummaryLines,
  formatUptime,
  getFeedbackCategoryLabel,
  getFeedbackSentimentLabel,
  getIncidentCategoryColor,
  getIncidentLevelLabel,
  getOnboardingStateLabel,
  getSelfTestStatusLabel,
} from './settingsSupport.utils';

type Translations = ReturnType<typeof useTranslation>['t'];

const SUPPORT_ENDPOINTS = {
  status: '/api/support/status',
  incidents: '/api/support/incidents',
  feedback: '/api/support/feedback',
  selfTest: '/api/support/self-test',
} as const;

const INCIDENT_LIMIT = 10;
const FEEDBACK_LIMIT = 5;

export function useSettingsSupport(t: Translations) {
  const [supportStatus, setSupportStatus] = useState<SupportStatus | null>(null);
  const [selfTestResult, setSelfTestResult] = useState<SelfTestResult | null>(null);
  const [incidentState, setIncidentState] = useState<SupportIncidentsResult | null>(null);
  const [feedbackState, setFeedbackState] = useState<SupportFeedbackResult | null>(null);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [selfTesting, setSelfTesting] = useState(false);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackForm] = Form.useForm();

  const fetchSupportStatus = useCallback(async () => {
    setLoadingSupport(true);
    try {
      const res = await apiClient.get<SupportStatus>(SUPPORT_ENDPOINTS.status);
      if (res.success) {
        setSupportStatus(res.data);
      } else {
        void message.error(t.settings.supportStatusLoadFailed);
      }
    } catch {
      void message.error(t.settings.supportStatusLoadFailed);
    } finally {
      setLoadingSupport(false);
    }
  }, [t.settings.supportStatusLoadFailed]);

  const fetchIncidents = useCallback(async () => {
    setIncidentLoading(true);
    try {
      const res = await apiClient.get<SupportIncidentsResult>(`${SUPPORT_ENDPOINTS.incidents}?limit=${INCIDENT_LIMIT}`);
      if (res.success) {
        setIncidentState(res.data);
      }
    } finally {
      setIncidentLoading(false);
    }
  }, []);

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const res = await apiClient.get<SupportFeedbackResult>(`${SUPPORT_ENDPOINTS.feedback}?limit=${FEEDBACK_LIMIT}`);
      if (res.success) {
        setFeedbackState(res.data);
      }
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  const runSelfTest = async () => {
    setSelfTesting(true);
    try {
      const res = await apiClient.post<SelfTestResult>(SUPPORT_ENDPOINTS.selfTest);
      if (res.success) {
        setSelfTestResult(res.data);
        void message.success(t.settings.supportSelfTestCompleted);
      } else {
        void message.error(res.error);
      }
    } finally {
      setSelfTesting(false);
    }
  };

  const handleSubmitFeedback = async () => {
    try {
      const values = await feedbackForm.validateFields();
      setSubmittingFeedback(true);
      try {
        const res = await apiClient.post<SupportFeedbackEntry>(SUPPORT_ENDPOINTS.feedback, {
          ...values,
          appVersion: supportStatus?.appVersion ?? '',
        });

        if (res.success) {
          feedbackForm.resetFields();
          void message.success(t.settings.feedbackSaved);
          await Promise.all([fetchSupportStatus(), fetchFeedback()]);
        } else {
          void message.error(res.error);
        }
      } finally {
        setSubmittingFeedback(false);
      }
    } catch {
      // Form validation error.
    }
  };

  const handleCopySupportSummary = async () => {
    if (!supportStatus) {
      void message.warning(t.settings.supportSummaryUnavailable);
      return;
    }

    try {
      await navigator.clipboard.writeText(buildSupportSummaryLines({
        t,
        supportStatus,
        selfTestResult,
        incidentState,
      }).join('\n'));
      void message.success(t.settings.supportSummaryCopied);
    } catch {
      void message.error(t.settings.supportSummaryCopyFailed);
    }
  };

  useEffect(() => { void fetchSupportStatus(); }, [fetchSupportStatus]);
  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);
  useEffect(() => { void fetchFeedback(); }, [fetchFeedback]);

  return {
    supportStatus,
    selfTestResult,
    incidentState,
    feedbackState,
    loadingSupport,
    selfTesting,
    incidentLoading,
    feedbackLoading,
    submittingFeedback,
    feedbackForm,
    runSelfTest,
    handleSubmitFeedback,
    handleCopySupportSummary,
    fetchSupportStatus,
    fetchIncidents,
    fetchFeedback,
    formatUptime,
    getSelfTestStatusLabel: (status: SelfTestResult['status']) => getSelfTestStatusLabel(t.settings, status),
    getFeedbackCategoryLabel: (category: SupportFeedbackEntry['category']) => getFeedbackCategoryLabel(t.settings, category),
    getFeedbackSentimentLabel: (sentiment: SupportFeedbackEntry['sentiment']) => getFeedbackSentimentLabel(t.settings, sentiment),
    getIncidentLevelLabel: (level: IncidentEntry['level']) => getIncidentLevelLabel(t.settings, level),
    getIncidentCategoryColor,
    getOnboardingStateLabel: (status?: string | null) => getOnboardingStateLabel(t.settings, status),
  };
}
