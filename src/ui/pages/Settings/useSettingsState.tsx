import { useState, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';
import { apiClient } from '../../api/client';
import { useTranslation } from '../../hooks/useTranslation';
import type { Language } from '../../i18n';
import type {
  AppConfig,
  RuntimeEntry,
  BrowserCore,
  BrowserCoreCatalogEntry,
  BackupEntry,
  SupportStatus,
  SupportIncidentsResult,
  SupportFeedbackResult,
  SelfTestResult,
  SupportFeedbackEntry,
  IncidentEntry,
} from '../../../server/shared/types';

export function useSettingsState() {
  const { t } = useTranslation();
  
  // ─── General Tab State ──────────────────────────────────────────────────────
  const [generalForm] = Form.useForm();
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // ─── Runtimes Tab State ─────────────────────────────────────────────────────
  const [runtimes, setRuntimes] = useState<RuntimeEntry[]>([]);
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);
  const [addRuntimeForm] = Form.useForm();
  const [addingRuntime, setAddingRuntime] = useState(false);

  // ─── Browser Cores Tab State ────────────────────────────────────────────────
  const [cores, setCores] = useState<BrowserCore[]>([]);
  const [catalog, setCatalog] = useState<BrowserCoreCatalogEntry[]>([]);
  const [loadingCores, setLoadingCores] = useState(false);
  const [importCoresOpen, setImportCoresOpen] = useState(false);
  const [importingCores, setImportingCores] = useState(false);
  const [installingCoreKey, setInstallingCoreKey] = useState<string | null>(null);
  const [corePackageFiles, setCorePackageFiles] = useState<Array<{ originFileObj?: File }>>([]);

  // ─── Backup Tab State ───────────────────────────────────────────────────────
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // ─── Logs Tab State ────────────────────────────────────────────────────────
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ─── Support Tab State ──────────────────────────────────────────────────────
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

  // ─── Fetch Functions ────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    const res = await apiClient.get<AppConfig>('/api/config');
    if (res.success) {
      generalForm.setFieldsValue({
        uiLanguage: res.data.uiLanguage,
        profilesDir: res.data.profilesDir,
        headless: res.data.headless,
        windowTitleSuffixEnabled: res.data.windowTitleSuffixEnabled,
        apiHost: res.data.api.host,
        apiPort: res.data.api.port,
        sessionCheckTimeout: res.data.sessionCheck.timeoutMs,
        sessionCheckHeadless: res.data.sessionCheck.headless,
      });
    }
  }, [generalForm]);

  const fetchRuntimes = useCallback(async () => {
    setLoadingRuntimes(true);
    const res = await apiClient.get<RuntimeEntry[]>('/api/runtimes');
    if (res.success) setRuntimes(res.data);
    setLoadingRuntimes(false);
  }, []);

  const fetchCores = useCallback(async () => {
    setLoadingCores(true);
    const [coresRes, catalogRes] = await Promise.all([
      apiClient.get<BrowserCore[]>('/api/browser-cores'),
      apiClient.get<BrowserCoreCatalogEntry[]>('/api/browser-cores/catalog'),
    ]);
    if (coresRes.success) setCores(coresRes.data);
    if (catalogRes.success) setCatalog(catalogRes.data);
    setLoadingCores(false);
  }, []);

  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    const res = await apiClient.get<BackupEntry[]>('/api/backups');
    if (res.success) setBackups(res.data);
    setLoadingBackups(false);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    const res = await apiClient.get<Array<{ raw: string }>>('/api/logs');
    if (res.success) setLogLines(res.data.map((entry) => entry.raw));
    setLoadingLogs(false);
  }, []);

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

  // ─── General Tab Handlers ───────────────────────────────────────────────────

  const handleSaveGeneral = async () => {
    try {
      const values = await generalForm.validateFields();
      setSavingGeneral(true);
      const res = await apiClient.put('/api/config', {
        uiLanguage: values.uiLanguage,
        profilesDir: values.profilesDir,
        headless: values.headless,
        windowTitleSuffixEnabled: values.windowTitleSuffixEnabled,
        api: { host: values.apiHost, port: values.apiPort },
        sessionCheck: { timeoutMs: values.sessionCheckTimeout, headless: values.sessionCheckHeadless },
      });
      setSavingGeneral(false);

      if (res.success) {
        localStorage.setItem('uiLanguage', values.uiLanguage);
        void message.success(t.settings.settingsSaved);
      } else {
        void message.error(res.error);
      }
    } catch (err) {
      // Form validation error
    }
  };

  const handleResetOnboarding = async () => {
    await apiClient.put('/api/config', { onboardingCompleted: false });
    setWizardOpen(true);
  };

  // ─── Runtimes Tab Handlers ──────────────────────────────────────────────────

  const handleAddRuntime = async () => {
    try {
      const values = await addRuntimeForm.validateFields();
      setAddingRuntime(true);
      const res = await apiClient.post('/api/runtimes', values);
      setAddingRuntime(false);
      if (res.success) {
        addRuntimeForm.resetFields();
        void fetchRuntimes();
      } else {
        void message.error(res.error);
      }
    } catch (err) {
      // Form validation error
    }
  };

  const handleDeleteRuntime = async (key: string) => {
    const res = await apiClient.delete(`/api/runtimes/${key}`);
    if (res.success) void fetchRuntimes();
    else void message.error(res.error);
  };

  // ─── Browser Cores Tab Handlers ─────────────────────────────────────────────

  const handleImportCore = async () => {
    const selectedFile = corePackageFiles[0]?.originFileObj;
    if (!selectedFile) {
      void message.warning('Chọn gói browser core trước');
      return;
    }

    setImportingCores(true);
    try {
      const payload = await selectedFile.arrayBuffer();
      const response = await fetch(apiClient.buildUrl('/api/browser-cores/import-package'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: payload,
      });
      const json = await response.json() as { success: boolean; error?: string };
      setImportingCores(false);

      if (!response.ok || !json.success) {
        void message.error(json.error || 'Không thể import browser core');
        return;
      }

      setImportCoresOpen(false);
      setCorePackageFiles([]);
      void message.success('Đã cài browser core');
      await fetchCores();
    } catch (err) {
      setImportingCores(false);
      void message.error('Import failed');
    }
  };

  const handleDeleteCore = async (id: string) => {
    const res = await apiClient.delete(`/api/browser-cores/${id}`);
    if (res.success) {
      void message.success('Đã gỡ browser core');
      await fetchCores();
    } else {
      void message.error(res.error);
    }
  };

  const handleInstallFromCatalog = async (key: string) => {
    setInstallingCoreKey(key);
    try {
      const response = await fetch(apiClient.buildUrl(`/api/browser-cores/catalog/${encodeURIComponent(key)}/install`), {
        method: 'POST',
      });
      const json = await response.json() as { success: boolean; error?: string };
      setInstallingCoreKey(null);

      if (!response.ok || !json.success) {
        void message.error(json.error || 'Không thể cài browser core từ catalog');
        return;
      }

      void message.success('Đã tải và cài browser core');
      await fetchCores();
    } catch (err) {
      setInstallingCoreKey(null);
      void message.error('Installation failed');
    }
  };

  // ─── Backup Tab Handlers ────────────────────────────────────────────────────

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    const res = await apiClient.post<BackupEntry>('/api/backups');
    setCreatingBackup(false);
    if (res.success) {
      void message.success(`Đã tạo backup: ${res.data.filename}`);
      void fetchBackups();
    } else {
      void message.error(res.error);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const res = await apiClient.post(`/api/backups/restore/${encodeURIComponent(filename)}`);
    if (res.success) void message.success('Đã khôi phục backup. Khởi động lại server để áp dụng.');
    else void message.error(res.error);
  };

  const handleExportBackup = (filename: string) => {
    window.open(apiClient.buildUrl(`/api/backups/export/${encodeURIComponent(filename)}`), '_blank');
  };

  // ─── Support Tab Handlers ───────────────────────────────────────────────────

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
    } catch (err) {
      // Form validation error
    }
  };

  const handleCopySupportSummary = async () => {
    if (!supportStatus) {
      void message.warning(t.settings.supportSummaryUnavailable);
      return;
    }

    const summaryLines = [
      t.settings.supportSummaryTitle,
      `${t.settings.appVersionLabel}: ${supportStatus.appVersion}`,
      `${t.settings.nodeVersionLabel}: ${supportStatus.nodeVersion}`,
      `${t.settings.platformLabel}: ${supportStatus.platform}/${supportStatus.arch}`,
      `${t.settings.uptimeLabel}: ${formatUptime(supportStatus.uptimeSeconds)}`,
      `${t.settings.dataDirLabel}: ${supportStatus.dataDir}`,
      `${t.settings.diagnosticsLabel}: ${supportStatus.diagnosticsReady ? t.settings.diagnosticsReadyState : t.settings.diagnosticsMissingState}`,
      `${t.settings.onboardingLabel}: ${supportStatus.onboardingCompleted ? t.settings.statusCompleted : t.settings.statusPending}`,
      `${t.settings.onboardingStateLabel}: ${getOnboardingStateLabel(supportStatus.onboardingState.status)} (${t.settings.stepLabel} ${supportStatus.onboardingState.currentStep})`,
      `${t.settings.profilesLabel}: ${supportStatus.profileCount}`,
      `${t.settings.proxiesLabel}: ${supportStatus.proxyCount}`,
      `${t.settings.backupsLabel}: ${supportStatus.backupCount}`,
      `${t.settings.feedbackInboxLabel}: ${supportStatus.feedbackCount} ${t.settings.entriesLabel}`,
      `${t.settings.usageLabel}: ${supportStatus.usageMetrics.profileCreates} ${t.settings.createdLabel} / ${supportStatus.usageMetrics.profileImports} ${t.settings.importedLabel} / ${supportStatus.usageMetrics.profileLaunches} ${t.settings.launchesLabel}`,
      `${t.settings.sessionChecksLabel}: ${supportStatus.usageMetrics.sessionChecks} ${t.settings.totalLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedIn} ${t.settings.loggedInLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedOut} ${t.settings.loggedOutLabel} / ${supportStatus.usageMetrics.sessionCheckErrors} ${t.settings.errorsLabel}`,
      `${t.settings.offlineSecretLabel}: ${supportStatus.offlineSecretConfigured ? t.settings.configuredState : t.settings.missingState}`,
      `${t.settings.codeSigningLabel}: ${supportStatus.codeSigningConfigured ? t.settings.configuredState : t.settings.missingState}`,
      `${t.settings.supportPagesLabel}: ${supportStatus.supportPagesReady ? t.settings.readyState : t.settings.missingState}`,
      `${t.settings.releaseReadinessLabel}: ${supportStatus.releaseReady ? t.settings.readyState : t.settings.needsAttentionState}`,
      `${t.settings.recentIncidentsLabel}: ${supportStatus.recentIncidentCount} ${t.settings.totalLabel} / ${supportStatus.recentErrorCount} ${t.settings.errorsLabel}`,
      `${t.settings.lastIncidentLabel}: ${supportStatus.lastIncidentAt ? new Date(supportStatus.lastIncidentAt).toLocaleString() : t.settings.noneValue}`,
      `${t.settings.topIncidentCategoryLabel}: ${supportStatus.recentIncidentCategories[0]?.label ?? t.settings.noneValue}`,
    ];

    if (supportStatus.usageMetrics.lastProfileCreatedAt) {
      summaryLines.push(`${t.settings.lastProfileCreatedLabel}: ${new Date(supportStatus.usageMetrics.lastProfileCreatedAt).toLocaleString()}`);
    }
    if (supportStatus.usageMetrics.lastProfileImportedAt) {
      summaryLines.push(`${t.settings.lastProfileImportedLabel}: ${new Date(supportStatus.usageMetrics.lastProfileImportedAt).toLocaleString()}`);
    }
    if (supportStatus.usageMetrics.lastProfileLaunchAt) {
      summaryLines.push(`${t.settings.lastLaunchLabel}: ${new Date(supportStatus.usageMetrics.lastProfileLaunchAt).toLocaleString()}`);
    }
    if (supportStatus.usageMetrics.lastSessionCheckAt) {
      summaryLines.push(`${t.settings.lastSessionCheckLabel}: ${new Date(supportStatus.usageMetrics.lastSessionCheckAt).toLocaleString()}`);
    }
    if (supportStatus.onboardingState.lastOpenedAt) {
      summaryLines.push(`${t.settings.lastOnboardingOpenLabel}: ${new Date(supportStatus.onboardingState.lastOpenedAt).toLocaleString()}`);
    }
    if (supportStatus.onboardingState.profileCreatedAt) {
      summaryLines.push(`${t.settings.onboardingProfileCreatedLabel}: ${new Date(supportStatus.onboardingState.profileCreatedAt).toLocaleString()}`);
    }
    if (supportStatus.lastFeedbackAt) {
      summaryLines.push(`Last feedback: ${new Date(supportStatus.lastFeedbackAt).toLocaleString()}`);
    }

    if (supportStatus.warnings.length > 0) {
      summaryLines.push(`${t.settings.warningsLabel}: ${supportStatus.warnings.join(' | ')}`);
    } else {
      summaryLines.push(`${t.settings.warningsLabel}: ${t.settings.noneValue}`);
    }

    if (selfTestResult) {
      summaryLines.push(`${t.settings.selfTestLabel}: ${getSelfTestStatusLabel(selfTestResult.status)} @ ${new Date(selfTestResult.checkedAt).toLocaleString()}`);
      summaryLines.push(
        ...selfTestResult.checks.map((check) => `- ${check.label}: ${getSelfTestStatusLabel(check.status)} (${check.detail})`),
      );
    }

    if (incidentState && incidentState.incidents.length > 0) {
      if (incidentState.summary.categories.length > 0) {
        summaryLines.push(
          `${t.settings.incidentCategoriesLabel}: ${incidentState.summary.categories
            .slice(0, 4)
            .map((category) => `${category.label} (${category.count})`)
            .join(', ')}`,
        );
      }
      summaryLines.push(t.settings.recentIncidentDetailsLabel);
      summaryLines.push(
        ...incidentState.incidents.slice(0, 5).map((incident) =>
          `- [${getIncidentLevelLabel(incident.level)} | ${incident.categoryLabel}] ${incident.source} @ ${new Date(incident.timestamp).toLocaleString()}: ${incident.message}`),
      );
    }

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.settings.supportSummaryCopied);
    } catch {
      void message.error(t.settings.supportSummaryCopyFailed);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  }

  function getSelfTestStatusLabel(status: SelfTestResult['status']): string {
    if (status === 'pass') return t.settings.statusPass;
    if (status === 'warn') return t.settings.statusWarn;
    return t.settings.statusFail;
  }

  function getFeedbackCategoryLabel(category: SupportFeedbackEntry['category']): string {
    if (category === 'bug') return t.settings.feedbackCategoryBug;
    if (category === 'question') return t.settings.feedbackCategoryQuestion;
    return t.settings.feedbackCategoryFeedback;
  }

  function getFeedbackSentimentLabel(sentiment: SupportFeedbackEntry['sentiment']): string {
    if (sentiment === 'positive') return t.settings.feedbackSentimentPositive;
    if (sentiment === 'negative') return t.settings.feedbackSentimentNegative;
    return t.settings.feedbackSentimentNeutral;
  }

  function getIncidentLevelLabel(level: IncidentEntry['level']): string {
    return level === 'error' ? t.settings.incidentLevelError : t.settings.incidentLevelWarn;
  }

  function getIncidentCategoryColor(category: string): string {
    if (category === 'electron-process' || category === 'renderer-navigation') return 'volcano';
    if (category === 'startup-readiness' || category === 'runtime-launch') return 'orange';
    if (category === 'proxy') return 'gold';
    if (category === 'extension') return 'geekblue';
    if (category === 'cookies' || category === 'profile-package') return 'purple';
    if (category === 'support' || category === 'onboarding') return 'cyan';
    return 'default';
  }

  function getOnboardingStateLabel(status?: string | null): string {
    if (status === 'in_progress') return t.settings.onboardingStateInProgress;
    if (status === 'profile_created') return t.settings.onboardingStateProfileCreated;
    if (status === 'completed') return t.settings.onboardingStateCompleted;
    if (status === 'skipped') return t.settings.onboardingStateSkipped;
    return t.settings.onboardingStateNotStarted;
  }

  // ─── Initial Fetch Effects ──────────────────────────────────────────────────

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);
  useEffect(() => { void fetchRuntimes(); }, [fetchRuntimes]);
  useEffect(() => { void fetchCores(); }, [fetchCores]);
  useEffect(() => { void fetchBackups(); }, [fetchBackups]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useEffect(() => { void fetchSupportStatus(); }, [fetchSupportStatus]);
  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);
  useEffect(() => { void fetchFeedback(); }, [fetchFeedback]);

  return {
    t,
    
    // General
    generalForm, savingGeneral, wizardOpen, setWizardOpen, handleSaveGeneral, handleResetOnboarding,
    
    // Runtimes
    runtimes, loadingRuntimes, addRuntimeForm, addingRuntime, handleAddRuntime, handleDeleteRuntime, fetchRuntimes,
    
    // Cores
    cores, catalog, loadingCores, importCoresOpen, setImportCoresOpen, importingCores, installingCoreKey, 
    corePackageFiles, setCorePackageFiles, handleImportCore, handleDeleteCore, handleInstallFromCatalog, fetchCores,
    
    // Backups
    backups, loadingBackups, creatingBackup, handleCreateBackup, handleRestoreBackup, handleExportBackup, fetchBackups,
    
    // Logs
    logLines, loadingLogs, fetchLogs,
    
    // Support
    supportStatus, selfTestResult, incidentState, feedbackState, loadingSupport, selfTesting, incidentLoading, 
    feedbackLoading, submittingFeedback, feedbackForm, runSelfTest, handleSubmitFeedback, 
    handleCopySupportSummary, fetchSupportStatus, fetchIncidents, fetchFeedback,
    
    // Helpers
    formatUptime, getSelfTestStatusLabel, getFeedbackCategoryLabel, getFeedbackSentimentLabel,
    getIncidentLevelLabel, getIncidentCategoryColor, getOnboardingStateLabel
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
