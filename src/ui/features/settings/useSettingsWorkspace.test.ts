import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addRuntimeForm: {
    resetFields: vi.fn(),
    validateFields: vi.fn(),
  },
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  buildUrl: vi.fn((path: string) => `http://127.0.0.1:3210${path}`),
  fetchMock: vi.fn(),
  formQueue: [] as Array<[unknown]>,
  generalForm: {
    resetFields: vi.fn(),
    setFieldsValue: vi.fn(),
    validateFields: vi.fn(),
  },
  localStorageSetItem: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  stateCursor: 0,
  stateOverrides: [] as unknown[],
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  windowOpen: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useEffect: (effect: () => void | Promise<void>) => {
    void effect();
  },
  useState: <T>(initial: T) => {
    const index = mocks.stateCursor;
    const setter = vi.fn();
    mocks.stateSetters[index] = setter;
    mocks.stateCursor += 1;

    const hasOverride = Object.prototype.hasOwnProperty.call(mocks.stateOverrides, index);
    const value = hasOverride ? mocks.stateOverrides[index] as T : initial;

    return [value, setter] as const;
  },
}));

vi.mock('antd', () => ({
  Form: {
    useForm: () => mocks.formQueue.shift() ?? [mocks.generalForm],
  },
  message: {
    error: mocks.messageError,
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
  },
}));

vi.mock('../../api/client', () => ({
  apiClient: {
    buildUrl: mocks.buildUrl,
    delete: mocks.apiDelete,
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
  },
}));

function createTranslation() {
  return {
    settings: {
      backupCreated: 'Backup created: {filename}',
      backupRestored: 'Backup restored',
      browserCoreCatalogInstallFailed: 'Catalog install failed',
      browserCoreCatalogInstalled: 'Catalog installed',
      browserCoreCatalogInstallUnexpected: 'Catalog install unexpected',
      browserCoreDeleted: 'Browser core removed',
      browserCoreImportFailed: 'Core import failed',
      browserCoreImported: 'Browser core installed',
      browserCoreImportUnexpected: 'Core import unexpected',
      browserCorePackageRequired: 'Choose package first',
      settingsSaved: 'Settings saved',
    },
  } as const;
}

function createConfig() {
  return {
    api: { host: '127.0.0.1', port: 3210 },
    headless: false,
    onboardingCompleted: true,
    profilesDir: 'E:/profiles',
    runtimes: {},
    sessionCheck: {
      enabledByDefault: true,
      headless: true,
      timeoutMs: 45000,
    },
    uiLanguage: 'en',
    windowTitleSuffixEnabled: true,
  };
}

function createCore() {
  return {
    channel: 'stable',
    executablePath: 'C:/Chrome/chrome.exe',
    id: 'core-1',
    installedAt: '2026-03-27T12:00:00.000Z',
    key: 'chrome-stable',
    label: 'Chrome',
    managedRuntimeKey: 'chrome',
    platform: 'win64',
    version: '123.0.0.0',
  };
}

function createCatalogEntry() {
  return {
    artifactUrl: 'https://example.test/chrome.zip',
    channel: 'stable',
    installed: false,
    installedCoreId: null,
    key: 'chrome-stable',
    label: 'Chrome',
    notes: 'Recommended',
    platform: 'win64',
    status: 'package-ready' as const,
    version: '123.0.0.0',
  };
}

function createBackup() {
  return {
    filename: 'backup-1.zip',
    sizeBytes: 1024,
    timestamp: '2026-03-27T12:00:00.000Z',
  };
}

function primeInitialWorkspaceLoads() {
  mocks.apiGet.mockResolvedValue({ success: true, data: [] });
  mocks.apiGet
    .mockResolvedValueOnce({ success: true, data: createConfig() })
    .mockResolvedValueOnce({ success: true, data: [{ key: 'chrome', available: true, executablePath: 'C:/Chrome/chrome.exe' }] })
    .mockResolvedValueOnce({ success: true, data: [createCore()] })
    .mockResolvedValueOnce({ success: true, data: [createCatalogEntry()] })
    .mockResolvedValueOnce({ success: true, data: [createBackup()] })
    .mockResolvedValueOnce({ success: true, data: [{ raw: 'line-1' }, { raw: 'line-2' }] });
}

describe('useSettingsWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.addRuntimeForm.resetFields.mockReset();
    mocks.addRuntimeForm.validateFields.mockReset();
    mocks.apiDelete.mockReset();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.buildUrl.mockClear();
    mocks.fetchMock.mockReset();
    mocks.formQueue = [[mocks.generalForm], [mocks.addRuntimeForm]];
    mocks.generalForm.resetFields.mockReset();
    mocks.generalForm.setFieldsValue.mockReset();
    mocks.generalForm.validateFields.mockReset();
    mocks.localStorageSetItem.mockReset();
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.stateCursor = 0;
    mocks.stateOverrides = [];
    mocks.stateSetters = [];
    mocks.windowOpen.mockReset();

    vi.stubGlobal('fetch', mocks.fetchMock);
    vi.stubGlobal('localStorage', {
      setItem: mocks.localStorageSetItem,
    });
    vi.stubGlobal('window', {
      open: mocks.windowOpen,
    });
  });

  it('loads config, runtimes, cores, backups, and logs on startup', async () => {
    primeInitialWorkspaceLoads();

    const { useSettingsWorkspace } = await import('./useSettingsWorkspace');
    const hook = useSettingsWorkspace(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(6);
    });
    await vi.waitFor(() => {
      expect(mocks.stateSetters[5]).toHaveBeenCalledWith([createCore()]);
    });

    expect(hook.savingGeneral).toBe(false);
    expect(mocks.apiGet.mock.calls.map(([path]) => path)).toEqual([
      '/api/config',
      '/api/runtimes',
      '/api/browser-cores',
      '/api/browser-cores/catalog',
      '/api/backups',
      '/api/logs',
    ]);
    expect(mocks.generalForm.setFieldsValue).toHaveBeenCalledWith({
      apiHost: '127.0.0.1',
      apiPort: 3210,
      headless: false,
      profilesDir: 'E:/profiles',
      sessionCheckHeadless: true,
      sessionCheckTimeout: 45000,
      uiLanguage: 'en',
      windowTitleSuffixEnabled: true,
    });
    expect(mocks.stateSetters[2]).toHaveBeenCalledWith([
      { key: 'chrome', available: true, executablePath: 'C:/Chrome/chrome.exe' },
    ]);
    expect(mocks.stateSetters[6]).toHaveBeenCalledWith([createCatalogEntry()]);
    expect(mocks.stateSetters[12]).toHaveBeenCalledWith([createBackup()]);
    expect(mocks.stateSetters[15]).toHaveBeenCalledWith(['line-1', 'line-2']);
    expect(mocks.stateSetters[3]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[3]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[7]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[7]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[13]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[13]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[16]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[16]).toHaveBeenNthCalledWith(2, false);
  });

  it('saves general settings and reopens onboarding', async () => {
    primeInitialWorkspaceLoads();
    mocks.generalForm.validateFields.mockResolvedValue({
      apiHost: '0.0.0.0',
      apiPort: 4321,
      headless: true,
      profilesDir: 'D:/profiles',
      sessionCheckHeadless: false,
      sessionCheckTimeout: 60000,
      uiLanguage: 'vi',
      windowTitleSuffixEnabled: false,
    });
    mocks.apiPut
      .mockResolvedValueOnce({ success: true, data: null })
      .mockResolvedValueOnce({ success: true, data: null });

    const { useSettingsWorkspace } = await import('./useSettingsWorkspace');
    const hook = useSettingsWorkspace(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(6);
    });

    await hook.handleSaveGeneral();
    await hook.handleResetOnboarding();

    expect(mocks.apiPut).toHaveBeenNthCalledWith(1, '/api/config', {
      api: { host: '0.0.0.0', port: 4321 },
      headless: true,
      profilesDir: 'D:/profiles',
      sessionCheck: { timeoutMs: 60000, headless: false },
      uiLanguage: 'vi',
      windowTitleSuffixEnabled: false,
    });
    expect(mocks.localStorageSetItem).toHaveBeenCalledWith('uiLanguage', 'vi');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Settings saved');
    expect(mocks.apiPut).toHaveBeenNthCalledWith(2, '/api/config', { onboardingCompleted: false });
    expect(mocks.stateSetters[1]).toHaveBeenCalledWith(true);
    expect(mocks.stateSetters[0]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[0]).toHaveBeenNthCalledWith(2, false);
  });

  it('manages runtime add/delete flows and resets log loading after failures', async () => {
    primeInitialWorkspaceLoads();
    mocks.addRuntimeForm.validateFields.mockResolvedValue({
      executablePath: 'C:/Beta/chrome.exe',
      key: 'chrome-beta',
      label: 'Chrome Beta',
    });
    mocks.apiPost.mockResolvedValue({ success: true, data: null });
    mocks.apiDelete
      .mockResolvedValueOnce({ success: true, data: null })
      .mockResolvedValueOnce({ success: false, error: 'Delete failed' });

    const { useSettingsWorkspace } = await import('./useSettingsWorkspace');
    const hook = useSettingsWorkspace(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(6);
    });

    await hook.handleAddRuntime();
    await hook.handleDeleteRuntime('chrome-beta');
    await hook.handleDeleteRuntime('missing-runtime');

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/runtimes', {
      executablePath: 'C:/Beta/chrome.exe',
      key: 'chrome-beta',
      label: 'Chrome Beta',
    });
    expect(mocks.addRuntimeForm.resetFields).toHaveBeenCalledOnce();
    expect(mocks.apiDelete).toHaveBeenNthCalledWith(1, '/api/runtimes/chrome-beta');
    expect(mocks.apiDelete).toHaveBeenNthCalledWith(2, '/api/runtimes/missing-runtime');
    expect(mocks.messageError).toHaveBeenCalledWith('Delete failed');
    expect(mocks.stateSetters[4]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[4]).toHaveBeenNthCalledWith(2, false);

    mocks.apiGet.mockRejectedValueOnce(new Error('log failure'));

    await expect(hook.fetchLogs()).rejects.toThrow('log failure');
    expect(mocks.stateSetters[16]).toHaveBeenNthCalledWith(3, true);
    expect(mocks.stateSetters[16]).toHaveBeenNthCalledWith(4, false);
  });

  it('handles browser core, backup, and export actions with localized messages', async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    primeInitialWorkspaceLoads();
    mocks.stateOverrides[11] = [{ originFileObj: { arrayBuffer } }];
    mocks.fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ success: false, error: 'Catalog failed' }),
      });
    mocks.apiDelete.mockResolvedValueOnce({ success: true, data: null });
    mocks.apiPost
      .mockResolvedValueOnce({ success: true, data: { filename: 'backup-2.zip' } })
      .mockResolvedValueOnce({ success: true, data: null });

    const { useSettingsWorkspace } = await import('./useSettingsWorkspace');
    const hook = useSettingsWorkspace(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(6);
    });

    await hook.handleImportCore();
    await hook.handleInstallFromCatalog('chrome stable');
    await hook.handleDeleteCore('core-1');
    await hook.handleCreateBackup();
    await hook.handleRestoreBackup('backup 2.zip');
    hook.handleExportBackup('backup 2.zip');

    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(mocks.fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3210/api/browser-cores/import-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: expect.any(ArrayBuffer),
    });
    expect(mocks.fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3210/api/browser-cores/catalog/chrome%20stable/install', {
      method: 'POST',
    });
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Browser core installed');
    expect(mocks.messageError).toHaveBeenCalledWith('Catalog failed');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Browser core removed');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Backup created: backup-2.zip');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Backup restored');
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/browser-cores/core-1');
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/backups');
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/api/backups/restore/backup%202.zip');
    expect(mocks.windowOpen).toHaveBeenCalledWith('http://127.0.0.1:3210/api/backups/export/backup%202.zip', '_blank');
    expect(mocks.stateSetters[8]).toHaveBeenCalledWith(false);
    expect(mocks.stateSetters[11]).toHaveBeenCalledWith([]);
    expect(mocks.stateSetters[9]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[9]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[10]).toHaveBeenNthCalledWith(1, 'chrome stable');
    expect(mocks.stateSetters[10]).toHaveBeenNthCalledWith(2, null);
    expect(mocks.stateSetters[14]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[14]).toHaveBeenNthCalledWith(2, false);
  });

  it('warns when importing a browser core without a selected package and reports unexpected failures', async () => {
    primeInitialWorkspaceLoads();
    mocks.fetchMock.mockRejectedValueOnce(new Error('network failed'));

    const { useSettingsWorkspace } = await import('./useSettingsWorkspace');
    const hookWithoutFile = useSettingsWorkspace(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(6);
    });

    await hookWithoutFile.handleImportCore();
    expect(mocks.messageWarning).toHaveBeenCalledWith('Choose package first');

    vi.resetModules();
    mocks.apiDelete.mockReset();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.fetchMock.mockReset();
    mocks.formQueue = [[mocks.generalForm], [mocks.addRuntimeForm]];
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.stateCursor = 0;
    mocks.stateOverrides = [];
    mocks.stateOverrides[11] = [{ originFileObj: { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)) } }];
    mocks.stateSetters = [];
    primeInitialWorkspaceLoads();
    mocks.fetchMock.mockRejectedValueOnce(new Error('network failed'));

    const { useSettingsWorkspace: useSettingsWorkspaceAgain } = await import('./useSettingsWorkspace');
    const hookWithFile = useSettingsWorkspaceAgain(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(6);
    });

    await hookWithFile.handleImportCore();
    expect(mocks.messageError).toHaveBeenCalledWith('Core import unexpected');
  });
});
