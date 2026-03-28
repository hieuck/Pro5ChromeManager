import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_UPDATE_POLL_INTERVAL_MS,
  ELECTRON_APP_ID,
  ELECTRON_APP_NAME,
  IPC_CHANNELS,
  PROCESS_EXIT_SUCCESS_CODE,
  WINDOW_EVENTS,
} from './constants';

const mocks = vi.hoisted(() => {
  const appHandlers = new Map<string, () => void>();
  const processHandlers = new Map<string, (...args: unknown[]) => void>();
  const updaterHandlers = new Map<string, (...args: unknown[]) => void>();
  const trayHandlers = new Map<string, () => void>();

  const windowInstance = {
    hide: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    show: vi.fn(),
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
  };

  const trayInstance = {
    destroy: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      trayHandlers.set(event, handler);
    }),
    setContextMenu: vi.fn(),
    setToolTip: vi.fn(),
  };

  const app = {
    exit: vi.fn(),
    getLocale: vi.fn(() => 'vi-VN'),
    getPath: vi.fn((name: string) => (name === 'appData' ? 'E:/AppData' : 'E:/UserData')),
    on: vi.fn((event: string, handler: () => void) => {
      appHandlers.set(event, handler);
      return app;
    }),
    quit: vi.fn(),
    setAppUserModelId: vi.fn(),
    setName: vi.fn(),
    setPath: vi.fn(),
  };

  const BrowserWindow = vi.fn((_options: unknown) => ({
    ...windowInstance,
  }));

  const Tray = vi.fn(() => trayInstance);

  const Menu = {
    buildFromTemplate: vi.fn((template: unknown[]) => ({ template })),
  };

  const ipcMain = {
    handle: vi.fn(),
  };

  const nativeImage = {
    createEmpty: vi.fn(() => ({ kind: 'empty' })),
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
    })),
  };

  const shell = {
    openExternal: vi.fn(),
  };

  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      updaterHandlers.set(event, handler);
      return autoUpdater;
    }),
    quitAndInstall: vi.fn(),
  };

  return {
    BrowserWindow,
    Menu,
    Tray,
    app,
    appHandlers,
    autoUpdater,
    existsSync: vi.fn((inputPath: string) => inputPath.endsWith('app-update.yml') || inputPath.endsWith('index.js')),
    ipcMain,
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    nativeImage,
    processHandlers,
    shell,
    trayHandlers,
    trayInstance,
    updaterHandlers,
    windowInstance,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  Menu: mocks.Menu,
  Tray: mocks.Tray,
  app: mocks.app,
  ipcMain: mocks.ipcMain,
  nativeImage: mocks.nativeImage,
  shell: mocks.shell,
}));

vi.mock('electron-updater', () => ({
  autoUpdater: mocks.autoUpdater,
}));

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
}));

vi.mock('fs/promises', () => ({
  default: {
    appendFile: mocks.appendFile,
    mkdir: mocks.mkdir,
  },
}));

vi.mock('./urlSafety', () => ({
  isSafeExternalUrl: vi.fn((url: string) => url.startsWith('https://safe.example')),
}));

describe('electron main process', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    mocks.appHandlers.clear();
    mocks.processHandlers.clear();
    mocks.updaterHandlers.clear();
    mocks.trayHandlers.clear();

    mocks.BrowserWindow.mockClear();
    mocks.Menu.buildFromTemplate.mockClear();
    mocks.Tray.mockClear();
    mocks.app.exit.mockClear();
    mocks.app.getLocale.mockClear();
    mocks.app.getPath.mockClear();
    mocks.app.on.mockClear();
    mocks.app.quit.mockClear();
    mocks.app.setAppUserModelId.mockClear();
    mocks.app.setName.mockClear();
    mocks.app.setPath.mockClear();
    mocks.autoUpdater.autoDownload = false;
    mocks.autoUpdater.autoInstallOnAppQuit = false;
    mocks.autoUpdater.checkForUpdates.mockClear();
    mocks.autoUpdater.checkForUpdates.mockResolvedValue(undefined);
    mocks.autoUpdater.on.mockClear();
    mocks.autoUpdater.quitAndInstall.mockClear();
    mocks.existsSync.mockReset();
    mocks.existsSync.mockImplementation((inputPath: string) => inputPath.endsWith('app-update.yml') || inputPath.endsWith('index.js'));
    mocks.ipcMain.handle.mockClear();
    mocks.mkdir.mockClear();
    mocks.appendFile.mockClear();
    mocks.nativeImage.createEmpty.mockClear();
    mocks.nativeImage.createFromPath.mockClear();
    mocks.shell.openExternal.mockClear();
    mocks.trayInstance.destroy.mockClear();
    mocks.trayInstance.on.mockClear();
    mocks.trayInstance.setContextMenu.mockClear();
    mocks.trayInstance.setToolTip.mockClear();
    mocks.windowInstance.hide.mockClear();
    mocks.windowInstance.focus.mockClear();
    mocks.windowInstance.loadURL.mockClear();
    mocks.windowInstance.loadURL.mockResolvedValue(undefined);
    mocks.windowInstance.on.mockClear();
    mocks.windowInstance.show.mockClear();
    mocks.windowInstance.webContents.executeJavaScript.mockClear();
    mocks.windowInstance.webContents.executeJavaScript.mockResolvedValue(undefined);
    mocks.windowInstance.webContents.on.mockClear();
    mocks.windowInstance.webContents.setWindowOpenHandler.mockClear();
    delete process.env['DATA_DIR'];
    delete process.env['NODE_ENV'];
    delete process.env['PRO5_BACKEND_ORIGIN'];
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: 'E:/Resources',
    });
  });

  it('initializes app metadata and localized tray menu labels', async () => {
    const { getTrayMenuTemplate, initializeAppPaths, resolveMainLogDir } = await import('./mainProcess');

    initializeAppPaths();

    expect(mocks.app.setName).toHaveBeenCalledWith(ELECTRON_APP_NAME);
    expect(mocks.app.setAppUserModelId).toHaveBeenCalledWith(ELECTRON_APP_ID);
    expect(mocks.app.setPath).toHaveBeenCalledWith('userData', expect.stringContaining(ELECTRON_APP_NAME));
    expect(resolveMainLogDir().replaceAll('\\', '/')).toBe('E:/UserData/logs');

    process.env['DATA_DIR'] = 'E:/Data';
    expect(resolveMainLogDir().replaceAll('\\', '/')).toBe('E:/Data/logs');
    expect(getTrayMenuTemplate()).toMatchObject([
      { label: 'Mở Pro5 Chrome Manager' },
      { type: 'separator' },
      { label: 'Thoát' },
    ]);
  });

  it('waits for backend readiness with retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ status: 'warming', warnings: ['booting'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { waitForBackendReady } = await import('./mainProcess');
      const readinessPromise = waitForBackendReady(2_000);

      await vi.advanceTimersByTimeAsync(500);
      await readinessPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('starts the embedded server from the built artifact', async () => {
    const { startEmbeddedServer } = await import('./mainProcess');
    const loader = vi.fn();

    await startEmbeddedServer(loader);

    expect(loader).toHaveBeenCalledWith(expect.stringContaining('server\\index.js'));
    expect(process.env['DATA_DIR']).toBe('E:/UserData');
  });

  it('rethrows loader failures when the fallback source entry is used', async () => {
    mocks.existsSync.mockImplementation(() => false);
    const { startEmbeddedServer } = await import('./mainProcess');
    const failingLoader = vi.fn(() => {
      throw new Error('boom');
    });

    await expect(startEmbeddedServer(failingLoader)).rejects.toThrow('boom');
  });

  it('registers app/process handlers and handles a ready flow without updater config', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: (...args: unknown[]) => void) => {
      mocks.processHandlers.set(event, handler);
      return process;
    }) as typeof process.on);
    mocks.existsSync.mockImplementation((inputPath: string) => inputPath.endsWith('index.js'));

    try {
      const {
        handleAppReady,
        registerMainProcess,
      } = await import('./mainProcess');

      registerMainProcess();
      expect(mocks.app.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      const loadServerModule = vi.fn();
      await handleAppReady(loadServerModule);

      expect(loadServerModule).toHaveBeenCalledOnce();
      expect(mocks.BrowserWindow).toHaveBeenCalledOnce();
      expect(mocks.Tray).toHaveBeenCalledOnce();
      expect(mocks.trayInstance.setToolTip).toHaveBeenCalledWith(ELECTRON_APP_NAME);
      expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();
      expect(mocks.windowInstance.loadURL).toHaveBeenCalled();
      expect(mocks.windowInstance.show).toHaveBeenCalled();
      const openHandler = mocks.windowInstance.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
      expect(openHandler?.({ url: 'https://safe.example/docs' })).toEqual({ action: 'deny' });
      expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://safe.example/docs');
      expect(openHandler?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('configures updater polling, dispatches update-ready, and installs downloaded updates', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    try {
      const {
        createTray,
        createWindow,
        registerUpdateInstallHandler,
        setupAutoUpdater,
      } = await import('./mainProcess');

      createWindow();
      createTray();
      registerUpdateInstallHandler();
      setupAutoUpdater();

      expect(mocks.autoUpdater.autoDownload).toBe(true);
      expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), AUTO_UPDATE_POLL_INTERVAL_MS);

      const installHandler = mocks.ipcMain.handle.mock.calls[0]?.[1] as (() => Promise<{ ok: boolean; error?: string }>);
      await expect(installHandler()).resolves.toEqual({ ok: false, error: 'No downloaded update available' });

      mocks.updaterHandlers.get('update-downloaded')?.({ version: '9.9.9' });
      expect(mocks.windowInstance.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(WINDOW_EVENTS.updateReady)),
      );

      await expect(installHandler()).resolves.toEqual({ ok: true });
      await vi.runOnlyPendingTimersAsync();
      expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);

      const trayMenu = mocks.Menu.buildFromTemplate.mock.calls[0]?.[0] as Array<{ click?: () => void }>;
      trayMenu[0]?.click?.();
      expect(mocks.windowInstance.show).toHaveBeenCalled();
      expect(mocks.windowInstance.focus).toHaveBeenCalled();

      trayMenu[2]?.click?.();
      expect(mocks.trayInstance.destroy).toHaveBeenCalled();
      expect(mocks.app.exit).toHaveBeenCalledWith(PROCESS_EXIT_SUCCESS_CODE);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('quits the app when ready handling cannot boot the server', async () => {
    const { handleAppReady } = await import('./mainProcess');
    const failingLoader = vi.fn(() => {
      throw new Error('boot failed');
    });

    await handleAppReady(failingLoader);

    expect(mocks.app.quit).toHaveBeenCalledOnce();
  });
});
