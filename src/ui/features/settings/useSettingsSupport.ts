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
} from '../../../server/shared/types';
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
    const res = await apiClient.get<SupportStatus>('/api/support/status');
    if (res.success) setSupportStatus(res.data);
    setLoadingSupport(false);
  }, []);

  const fetchIncidents = useCallback(async () => {
    setIncidentLoading(true);
    const res = await apiClient.get<SupportIncidentsResult>('/api/support/incidents?limit=10');
    if (res.success) setIncidentState(res.data);
    setIncidentLoading(false);
  }, []);

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const res = await apiClient.get<SupportFeedbackResult>('/api/support/feedback?limit=5');
    if (res.success) setFeedbackState(res.data);
    setFeedbackLoading(false);
  }, []);

  const runSelfTest = async () => {
    setSelfTesting(true);
    const res = await apiClient.post<SelfTestResult>('/api/support/self-test');
    setSelfTesting(false);
    if (res.success) {
      setSelfTestResult(res.data);
      void message.success(t.settings.supportSelfTestCompleted);
    } else {
      void message.error(res.error);
    }
  };

  const handleSubmitFeedback = async () => {
    try {
      const values = await feedbackForm.validateFields();
      setSubmittingFeedback(true);
      const res = await apiClient.post<SupportFeedbackEntry>('/api/support/feedback', {
        ...values,
        appVersion: supportStatus?.appVersion ?? '',
      });
      setSubmittingFeedback(false);

      if (res.success) {
        feedbackForm.resetFields();
        void message.success(t.settings.feedbackSaved);
        await Promise.all([fetchSupportStatus(), fetchFeedback()]);
      } else {
        void message.error(res.error);
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
