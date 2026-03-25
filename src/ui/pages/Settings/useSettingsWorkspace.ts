import { useCallback, useEffect, useState } from 'react';
import { Form, message } from 'antd';
import { apiClient } from '../../api/client';
import type { useTranslation } from '../../hooks/useTranslation';
import type {
  AppConfig,
  BackupEntry,
  BrowserCore,
  BrowserCoreCatalogEntry,
  RuntimeEntry,
} from '../../../server/shared/types';

type Translations = ReturnType<typeof useTranslation>['t'];

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
    } catch {
      // Form validation error.
    }
  };

  const handleResetOnboarding = async () => {
    await apiClient.put('/api/config', { onboardingCompleted: false });
    setWizardOpen(true);
  };

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
    } catch {
      // Form validation error.
    }
  };

  const handleDeleteRuntime = async (key: string) => {
    const res = await apiClient.delete(`/api/runtimes/${key}`);
    if (res.success) void fetchRuntimes();
    else void message.error(res.error);
  };

  const handleImportCore = async () => {
    const selectedFile = corePackageFiles[0]?.originFileObj;
    if (!selectedFile) {
      void message.warning('Chá»n gÃ³i browser core trÆ°á»›c');
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
        void message.error(json.error || 'KhÃ´ng thá»ƒ import browser core');
        return;
      }

      setImportCoresOpen(false);
      setCorePackageFiles([]);
      void message.success('ÄÃ£ cÃ i browser core');
      await fetchCores();
    } catch {
      setImportingCores(false);
      void message.error('Import failed');
    }
  };

  const handleDeleteCore = async (id: string) => {
    const res = await apiClient.delete(`/api/browser-cores/${id}`);
    if (res.success) {
      void message.success('ÄÃ£ gá»¡ browser core');
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
        void message.error(json.error || 'KhÃ´ng thá»ƒ cÃ i browser core tá»« catalog');
        return;
      }

      void message.success('ÄÃ£ táº£i vÃ  cÃ i browser core');
      await fetchCores();
    } catch {
      setInstallingCoreKey(null);
      void message.error('Installation failed');
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    const res = await apiClient.post<BackupEntry>('/api/backups');
    setCreatingBackup(false);
    if (res.success) {
      void message.success(`ÄÃ£ táº¡o backup: ${res.data.filename}`);
      void fetchBackups();
    } else {
      void message.error(res.error);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const res = await apiClient.post(`/api/backups/restore/${encodeURIComponent(filename)}`);
    if (res.success) void message.success('ÄÃ£ khÃ´i phá»¥c backup. Khá»Ÿi Ä‘á»™ng láº¡i server Ä‘á»ƒ Ã¡p dá»¥ng.');
    else void message.error(res.error);
  };

  const handleExportBackup = (filename: string) => {
    window.open(apiClient.buildUrl(`/api/backups/export/${encodeURIComponent(filename)}`), '_blank');
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
