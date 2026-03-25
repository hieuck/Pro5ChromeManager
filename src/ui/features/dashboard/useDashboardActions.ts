import { useCallback, useState } from 'react';
import { message, Form } from 'antd';
import { apiClient, buildApiUrl } from '../../api/client';
import { DashboardProfile, BackupEntry, SelfTestResult, FeedbackEntry } from './types';

export function useDashboardActions(
  loadDashboard: () => Promise<void>,
  t: any,
  launchReadyProfiles: DashboardProfile[],
  activeProfiles: DashboardProfile[],
  failingProxyIds: string[]
) {
  const [startingProfileId, setStartingProfileId] = useState<string | null>(null);
  const [startingAllReady, setStartingAllReady] = useState(false);
  const [stoppingProfileId, setStoppingProfileId] = useState<string | null>(null);
  const [stoppingAllRunning, setStoppingAllRunning] = useState(false);
  const [retestingProfileId, setRetestingProfileId] = useState<string | null>(null);
  const [retestingAll, setRetestingAll] = useState(false);
  const [runningSelfTest, setRunningSelfTest] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [feedbackForm] = Form.useForm();

  const handleStartProfile = useCallback(async (profileId: string) => {
    setStartingProfileId(profileId);
    const res = await apiClient.post(`/api/profiles/${profileId}/start`);
    setStartingProfileId(null);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.dashboard.profileStarted);
    await loadDashboard();
  }, [loadDashboard, t.dashboard]);

  const handleStopProfile = useCallback(async (profileId: string) => {
    setStoppingProfileId(profileId);
    const res = await apiClient.post(`/api/profiles/${profileId}/stop`);
    setStoppingProfileId(null);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.dashboard.profileStopped);
    await loadDashboard();
  }, [loadDashboard, t.dashboard]);

  const handleStartAllReadyProfiles = useCallback(async () => {
    if (!launchReadyProfiles.length) return;
    setStartingAllReady(true);
    const results = await Promise.all(
      launchReadyProfiles.map(async (profile) => ({
        id: profile.id,
        res: await apiClient.post(`/api/profiles/${profile.id}/start`),
      })),
    );
    setStartingAllReady(false);
    const failures = results.filter(({ res }) => !res.success);
    if (failures.length) {
      void message.warning(`${t.dashboard.bulkStartReadyResult}: ${results.length - failures.length}/${results.length}`);
    } else {
      void message.success(`${t.dashboard.bulkStartReadyResult}: ${results.length}/${results.length}`);
    }
    await loadDashboard();
  }, [launchReadyProfiles, loadDashboard, t.dashboard]);

  const handleStopAllRunningProfiles = useCallback(async () => {
    if (!activeProfiles.length) return;
    setStoppingAllRunning(true);
    const results = await Promise.all(
      activeProfiles.map(async (profile) => ({
        id: profile.id,
        res: await apiClient.post(`/api/profiles/${profile.id}/stop`),
      })),
    );
    setStoppingAllRunning(false);
    const failures = results.filter(({ res }) => !res.success);
    if (failures.length) {
      void message.warning(`${t.dashboard.bulkStopRunningResult}: ${results.length - failures.length}/${results.length}`);
    } else {
      void message.success(`${t.dashboard.bulkStopRunningResult}: ${results.length}/${results.length}`);
    }
    await loadDashboard();
  }, [activeProfiles, loadDashboard, t.dashboard]);

  const handleRetestProxy = useCallback(async (profile: DashboardProfile) => {
    if (!profile.proxy?.id) return;
    setRetestingProfileId(profile.id);
    const res = await apiClient.post<{
      total: number;
      healthy: number;
      failing: number;
    }>('/api/proxies/test-bulk', { ids: [profile.proxy.id] });
    setRetestingProfileId(null);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(
      `${t.dashboard.proxyRetested}: OK ${res.data.healthy} · FAIL ${res.data.failing}`,
    );
    await loadDashboard();
  }, [loadDashboard, t.dashboard]);

  const handleRetestAllFailingProxies = useCallback(async () => {
    if (!failingProxyIds.length) return;
    setRetestingAll(true);
    const res = await apiClient.post<{
      total: number;
      healthy: number;
      failing: number;
    }>('/api/proxies/test-bulk', { ids: failingProxyIds });
    setRetestingAll(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(
      `${t.dashboard.proxyRetested}: OK ${res.data.healthy} · FAIL ${res.data.failing}`,
    );
    await loadDashboard();
  }, [failingProxyIds, loadDashboard, t.dashboard]);

  const handleRunSelfTest = useCallback(async () => {
    setRunningSelfTest(true);
    const res = await apiClient.post<SelfTestResult>('/api/support/self-test');
    setRunningSelfTest(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    setSelfTest(res.data);
    void message.success(t.dashboard.selfTestRan);
  }, [t.dashboard]);

  const handleExportDiagnostics = useCallback(() => {
    window.open(buildApiUrl('/api/support/diagnostics'), '_blank');
    void message.success(t.dashboard.diagnosticsExportStarted);
  }, [t.dashboard]);

  const handleCreateBackup = useCallback(async () => {
    setCreatingBackup(true);
    const res = await apiClient.post<BackupEntry>('/api/backups');
    setCreatingBackup(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(`${t.dashboard.backupCreated}: ${res.data.filename}`);
    await loadDashboard();
  }, [loadDashboard, t.dashboard]);

  const handleOpenOnboarding = useCallback(async () => {
    await apiClient.put('/api/config', { onboardingCompleted: false });
    setOnboardingOpen(true);
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    const values = await feedbackForm.validateFields() as {
      category: 'bug' | 'feedback' | 'question';
      sentiment: 'negative' | 'neutral' | 'positive';
      message: string;
      email?: string;
    };

    setSubmittingFeedback(true);
    const res = await apiClient.post<FeedbackEntry>('/api/support/feedback', {
      ...values,
      appVersion: '',
    });
    setSubmittingFeedback(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    feedbackForm.resetFields();
    void message.success(t.dashboard.feedbackSaved);
    await loadDashboard();
  }, [feedbackForm, loadDashboard, t.dashboard]);

  return {
    startingProfileId,
    startingAllReady,
    stoppingProfileId,
    stoppingAllRunning,
    retestingProfileId,
    retestingAll,
    runningSelfTest,
    submittingFeedback,
    creatingBackup,
    selfTest, setSelfTest,
    onboardingOpen, setOnboardingOpen,
    feedbackForm,
    handleStartProfile,
    handleStopProfile,
    handleStartAllReadyProfiles,
    handleStopAllRunningProfiles,
    handleRetestProxy,
    handleRetestAllFailingProxies,
    handleRunSelfTest,
    handleExportDiagnostics,
    handleCreateBackup,
    handleOpenOnboarding,
    handleSubmitFeedback
  };
}
