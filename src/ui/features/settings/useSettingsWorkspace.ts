import { useCallback, useEffect, useState } from 'react';
import { Form, message } from 'antd';
import { apiClient } from '../../api/client';
import { formatMessage } from '../../i18n';
import type { useTranslation } from '../../shared/hooks/useTranslation';
import type {
  AppConfig,
  BackupEntry,
  BrowserCore,
  BrowserCoreCatalogEntry,
  RuntimeEntry,
} from '../../../shared/contracts';

type Translations = ReturnType<typeof useTranslation>['t'];

const WORKSPACE_ENDPOINTS = {
  config: '/api/config',
  runtimes: '/api/runtimes',
  browserCores: '/api/browser-cores',
  browserCoreCatalog: '/api/browser-cores/catalog',
  browserCoreImportPackage: '/api/browser-cores/import-package',
  backups: '/api/backups',
  logs: '/api/logs',
} as const;

const OCTET_STREAM_CONTENT_TYPE = 'application/octet-stream';

function buildRuntimeEndpoint(key: string): string {
  return `${WORKSPACE_ENDPOINTS.runtimes}/${key}`;
}

function buildBrowserCoreEndpoint(id: string): string {
  return `${WORKSPACE_ENDPOINTS.browserCores}/${id}`;
}

function buildBrowserCoreCatalogInstallEndpoint(key: string): string {
  return `${WORKSPACE_ENDPOINTS.browserCoreCatalog}/${encodeURIComponent(key)}/install`;
}

function buildBackupRestoreEndpoint(filename: string): string {
  return `${WORKSPACE_ENDPOINTS.backups}/restore/${encodeURIComponent(filename)}`;
}

function buildBackupExportEndpoint(filename: string): string {
  return `${WORKSPACE_ENDPOINTS.backups}/export/${encodeURIComponent(filename)}`;
}

export function useSettingsWorkspace(t: Translations) {
  const [generalForm] = Form.useForm();
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [runtimes, setRuntimes] = useState<RuntimeEntry[]>([]);
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);
  const [addRuntimeForm] = Form.useForm();
  const [addingRuntime, setAddingRuntime] = useState(false);

  const [cores, setCores] = useState<BrowserCore[]>([]);
  const [catalog, setCatalog] = useState<BrowserCoreCatalogEntry[]>([]);
  const [loadingCores, setLoadingCores] = useState(false);
  const [importCoresOpen, setImportCoresOpen] = useState(false);
  const [importingCores, setImportingCores] = useState(false);
  const [installingCoreKey, setInstallingCoreKey] = useState<string | null>(null);
  const [corePackageFiles, setCorePackageFiles] = useState<Array<{ originFileObj?: File }>>([]);

  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchConfig = useCallback(async () => {
    const res = await apiClient.get<AppConfig>(WORKSPACE_ENDPOINTS.config);
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
    try {
      const res = await apiClient.get<RuntimeEntry[]>(WORKSPACE_ENDPOINTS.runtimes);
      if (res.success) {
        setRuntimes(res.data);
      }
    } finally {
      setLoadingRuntimes(false);
    }
  }, []);

  const fetchCores = useCallback(async () => {
    setLoadingCores(true);
    try {
      const [coresRes, catalogRes] = await Promise.all([
        apiClient.get<BrowserCore[]>(WORKSPACE_ENDPOINTS.browserCores),
        apiClient.get<BrowserCoreCatalogEntry[]>(WORKSPACE_ENDPOINTS.browserCoreCatalog),
      ]);
      if (coresRes.success) {
        setCores(coresRes.data);
      }
      if (catalogRes.success) {
        setCatalog(catalogRes.data);
      }
    } finally {
      setLoadingCores(false);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const res = await apiClient.get<BackupEntry[]>(WORKSPACE_ENDPOINTS.backups);
      if (res.success) {
        setBackups(res.data);
      }
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await apiClient.get<Array<{ raw: string }>>(WORKSPACE_ENDPOINTS.logs);
      if (res.success) {
        setLogLines(res.data.map((entry) => entry.raw));
      }
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const handleSaveGeneral = async () => {
    try {
      const values = await generalForm.validateFields();
      setSavingGeneral(true);
      try {
        const res = await apiClient.put(WORKSPACE_ENDPOINTS.config, {
          uiLanguage: values.uiLanguage,
          profilesDir: values.profilesDir,
          headless: values.headless,
          windowTitleSuffixEnabled: values.windowTitleSuffixEnabled,
          api: { host: values.apiHost, port: values.apiPort },
          sessionCheck: { timeoutMs: values.sessionCheckTimeout, headless: values.sessionCheckHeadless },
        });

        if (res.success) {
          localStorage.setItem('uiLanguage', values.uiLanguage);
          void message.success(t.settings.settingsSaved);
        } else {
          void message.error(res.error);
        }
      } finally {
        setSavingGeneral(false);
      }
    } catch {
      // Form validation error.
    }
  };

  const handleResetOnboarding = async () => {
    await apiClient.put(WORKSPACE_ENDPOINTS.config, { onboardingCompleted: false });
    setWizardOpen(true);
  };

  const handleAddRuntime = async () => {
    try {
      const values = await addRuntimeForm.validateFields();
      setAddingRuntime(true);
      try {
        const res = await apiClient.post(WORKSPACE_ENDPOINTS.runtimes, values);
        if (res.success) {
          addRuntimeForm.resetFields();
          void fetchRuntimes();
        } else {
          void message.error(res.error);
        }
      } finally {
        setAddingRuntime(false);
      }
    } catch {
      // Form validation error.
    }
  };

  const handleDeleteRuntime = async (key: string) => {
    const res = await apiClient.delete(buildRuntimeEndpoint(key));
    if (res.success) {
      void fetchRuntimes();
    } else {
      void message.error(res.error);
    }
  };

  const handleImportCore = async () => {
    const selectedFile = corePackageFiles[0]?.originFileObj;
    if (!selectedFile) {
      void message.warning(t.settings.browserCorePackageRequired);
      return;
    }

    setImportingCores(true);
    try {
      const payload = await selectedFile.arrayBuffer();
      const response = await fetch(apiClient.buildUrl(WORKSPACE_ENDPOINTS.browserCoreImportPackage), {
        method: 'POST',
        headers: { 'Content-Type': OCTET_STREAM_CONTENT_TYPE },
        body: payload,
      });
      const json = await response.json() as { success: boolean; error?: string };

      if (!response.ok || !json.success) {
        void message.error(json.error || t.settings.browserCoreImportFailed);
        return;
      }

      setImportCoresOpen(false);
      setCorePackageFiles([]);
      void message.success(t.settings.browserCoreImported);
      await fetchCores();
    } catch {
      void message.error(t.settings.browserCoreImportUnexpected);
    } finally {
      setImportingCores(false);
    }
  };

  const handleDeleteCore = async (id: string) => {
    const res = await apiClient.delete(buildBrowserCoreEndpoint(id));
    if (res.success) {
      void message.success(t.settings.browserCoreDeleted);
      await fetchCores();
    } else {
      void message.error(res.error);
    }
  };

  const handleInstallFromCatalog = async (key: string) => {
    setInstallingCoreKey(key);
    try {
      const response = await fetch(apiClient.buildUrl(buildBrowserCoreCatalogInstallEndpoint(key)), {
        method: 'POST',
      });
      const json = await response.json() as { success: boolean; error?: string };

      if (!response.ok || !json.success) {
        void message.error(json.error || t.settings.browserCoreCatalogInstallFailed);
        return;
      }

      void message.success(t.settings.browserCoreCatalogInstalled);
      await fetchCores();
    } catch {
      void message.error(t.settings.browserCoreCatalogInstallUnexpected);
    } finally {
      setInstallingCoreKey(null);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await apiClient.post<BackupEntry>(WORKSPACE_ENDPOINTS.backups);
      if (res.success) {
        void message.success(formatMessage(t.settings.backupCreated, { filename: res.data.filename }));
        void fetchBackups();
      } else {
        void message.error(res.error);
      }
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const res = await apiClient.post(buildBackupRestoreEndpoint(filename));
    if (res.success) {
      void message.success(t.settings.backupRestored);
    } else {
      void message.error(res.error);
    }
  };

  const handleExportBackup = (filename: string) => {
    window.open(apiClient.buildUrl(buildBackupExportEndpoint(filename)), '_blank');
  };

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);
  useEffect(() => { void fetchRuntimes(); }, [fetchRuntimes]);
  useEffect(() => { void fetchCores(); }, [fetchCores]);
  useEffect(() => { void fetchBackups(); }, [fetchBackups]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return {
    generalForm,
    savingGeneral,
    wizardOpen,
    setWizardOpen,
    handleSaveGeneral,
    handleResetOnboarding,
    runtimes,
    loadingRuntimes,
    addRuntimeForm,
    addingRuntime,
    handleAddRuntime,
    handleDeleteRuntime,
    fetchRuntimes,
    cores,
    catalog,
    loadingCores,
    importCoresOpen,
    setImportCoresOpen,
    importingCores,
    installingCoreKey,
    corePackageFiles,
    setCorePackageFiles,
    handleImportCore,
    handleDeleteCore,
    handleInstallFromCatalog,
    fetchCores,
    backups,
    loadingBackups,
    creatingBackup,
    handleCreateBackup,
    handleRestoreBackup,
    handleExportBackup,
    fetchBackups,
    logLines,
    loadingLogs,
    fetchLogs,
  };
}
