import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron';
import { existsSync } from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { isSafeExternalUrl } from './urlSafety';
import {
  AUTO_UPDATE_POLL_INTERVAL_MS,
  BACKEND_READY_RETRY_INTERVAL_MS,
  BACKEND_READY_TIMEOUT_MS,
  DEFAULT_BACKEND_ORIGIN,
  ELECTRON_APP_ID,
  ELECTRON_APP_NAME,
  ELECTRON_RELATIVE_PATHS,
  IPC_CHANNELS,
  MAIN_LOG_DIRECTORY_NAME,
  MAIN_LOG_FILE_NAME,
  PROCESS_EXIT_SUCCESS_CODE,
  READY_ROUTE_PATH,
  UI_ROUTE_PATH,
  WINDOW_EVENTS,
  WINDOW_SIZE,
} from './constants';
import { getElectronStrings } from './localization';

type LogLevel = 'info' | 'warn' | 'error';
type UpdateInstallResponse = { ok: true } | { ok: false; error: string };
type InstanceManagerModule = { instanceManager: { stopAll: () => Promise<void> } };
type ServerModuleLoader = (serverPath: string) => void;
type InstanceManagerLoader = () => InstanceManagerModule;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverStarted = false;
let updateReady = false;
let updaterInterval: NodeJS.Timeout | null = null;
let mainProcessRegistered = false;
let updateInstallRegistered = false;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isDevelopmentEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

export function getBackendOrigin(): string {
  return process.env['PRO5_BACKEND_ORIGIN'] ?? DEFAULT_BACKEND_ORIGIN;
}

export function getAppUrl(): string {
  return `${getBackendOrigin()}${UI_ROUTE_PATH}`;
}

export function getReadyUrl(): string {
  return `${getBackendOrigin()}${READY_ROUTE_PATH}`;
}

export function resolveElectronPaths(): {
  readonly builtServerPath: string;
  readonly iconPath: string;
  readonly preloadPath: string;
  readonly sourceServerPath: string;
  readonly updateConfigPath: string;
} {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : process.cwd();

  return {
    builtServerPath: path.join(__dirname, ELECTRON_RELATIVE_PATHS.builtServer),
    iconPath: path.join(__dirname, ELECTRON_RELATIVE_PATHS.icon),
    preloadPath: path.join(__dirname, ELECTRON_RELATIVE_PATHS.preload),
    sourceServerPath: path.join(__dirname, ELECTRON_RELATIVE_PATHS.sourceServer),
    updateConfigPath: path.join(resourcesPath, ELECTRON_RELATIVE_PATHS.updateConfig),
  };
}

function resolveAppLocale(): string {
  return typeof app.getLocale === 'function' ? app.getLocale() : 'en';
}

export function resolveMainLogDir(): string {
  const dataDir = process.env['DATA_DIR'];
  if (dataDir) {
    return path.join(path.resolve(dataDir), MAIN_LOG_DIRECTORY_NAME);
  }

  return path.join(app.getPath('userData'), MAIN_LOG_DIRECTORY_NAME);
}

export function serializeLogEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  });
}

export async function writeMainLog(level: LogLevel, message: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    const logDir = resolveMainLogDir();
    await fsp.mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, MAIN_LOG_FILE_NAME);
    await fsp.appendFile(logPath, `${serializeLogEntry(level, message, meta)}\n`, 'utf-8');
  } catch {
    // best-effort only
  }
}

export function logMain(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  const timestampedLine = `[${new Date().toISOString()}] ${line}`;

  if (level === 'error') {
    console.error(timestampedLine);
  } else if (level === 'warn') {
    console.warn(timestampedLine);
  } else {
    console.log(timestampedLine);
  }

  void writeMainLog(level, message, meta);
}

export function defaultServerModuleLoader(serverPath: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require(serverPath);
}

export function defaultInstanceManagerLoader(): InstanceManagerModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require(path.join(__dirname, ELECTRON_RELATIVE_PATHS.instanceManager)) as InstanceManagerModule;
}

export async function startEmbeddedServer(loadServerModule: ServerModuleLoader = defaultServerModuleLoader): Promise<void> {
  if (serverStarted) {
    return;
  }

  const { builtServerPath, sourceServerPath } = resolveElectronPaths();
  const serverPath = existsSync(builtServerPath) ? builtServerPath : sourceServerPath;
  process.env['DATA_DIR'] = process.env['DATA_DIR'] || app.getPath('userData');

  try {
    loadServerModule(serverPath);
    serverStarted = true;
    logMain('info', 'Embedded server started', { serverPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMain('error', 'Failed to start embedded server', { error: message, serverPath });
    throw error;
  }
}

export async function waitForBackendReady(timeoutMs = BACKEND_READY_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      const response = await fetch(getReadyUrl());
      if (response.ok) {
        logMain('info', 'Backend ready for UI load', { attempt });
        return;
      }

      const payload = await response.json().catch(() => null) as { warnings?: string[]; status?: string } | null;
      logMain('warn', 'Backend not ready yet', {
        attempt,
        statusCode: response.status,
        backendStatus: payload?.status,
        warnings: payload?.warnings,
      });
    } catch (error) {
      logMain('warn', 'Backend readiness probe failed', {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await wait(BACKEND_READY_RETRY_INTERVAL_MS);
  }

  throw new Error(`Backend did not become ready within ${timeoutMs}ms`);
}

function resolveWindowIcon() {
  const iconImage = nativeImage.createFromPath(resolveElectronPaths().iconPath);
  return iconImage.isEmpty() ? undefined : iconImage;
}

function createUpdateReadyScript(version: string): string {
  const eventName = JSON.stringify(WINDOW_EVENTS.updateReady);
  const versionValue = JSON.stringify(version);
  return `window.dispatchEvent(new CustomEvent(${eventName}, { detail: { version: ${versionValue} } }))`;
}

export function createWindow(): void {
  const strings = getElectronStrings(resolveAppLocale());

  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    title: strings.windowTitle,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: resolveElectronPaths().preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  void waitForBackendReady()
    .then(() => mainWindow?.loadURL(getAppUrl()))
    .then(() => {
      logMain('info', 'Main window loaded UI');
      mainWindow?.show();
    })
    .catch((error) => {
      logMain('error', 'Main window failed to load UI', {
        error: error instanceof Error ? error.message : String(error),
        appUrl: getAppUrl(),
      });
      mainWindow?.show();
      const reloadPromise = mainWindow ? mainWindow.loadURL(getAppUrl()) : null;
      void reloadPromise?.catch(() => undefined);
    });

  mainWindow.on('close', (event) => {
    if (tray && process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('unresponsive', () => {
    logMain('warn', 'Main window became unresponsive');
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logMain('error', 'Renderer process gone', details as unknown as Record<string, unknown>);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logMain('error', 'Renderer failed to load URL', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isSafeExternalUrl(url)) {
      logMain('warn', 'Blocked unsafe external URL', { url });
      return { action: 'deny' };
    }

    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

export function getTrayMenuTemplate(): Array<{
  label?: string;
  type?: 'separator';
  click?: () => void;
}> {
  const strings = getElectronStrings(resolveAppLocale());

  return [
    {
      label: strings.trayOpen,
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          return;
        }

        createWindow();
      },
    },
    { type: 'separator' },
    {
      label: strings.trayQuit,
      click: () => {
        tray?.destroy();
        app.exit(PROCESS_EXIT_SUCCESS_CODE);
      },
    },
  ];
}

export function createTray(): void {
  const strings = getElectronStrings(resolveAppLocale());
  const iconImage = nativeImage.createFromPath(resolveElectronPaths().iconPath);
  const trayIcon = iconImage.isEmpty() ? nativeImage.createEmpty() : iconImage;

  tray = new Tray(trayIcon);
  tray.setToolTip(strings.trayTooltip);
  tray.setContextMenu(Menu.buildFromTemplate(getTrayMenuTemplate()));
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }

    createWindow();
  });
}

export function shouldEnableAutoUpdater(): boolean {
  if (isDevelopmentEnvironment()) {
    return false;
  }

  const { updateConfigPath } = resolveElectronPaths();
  if (!existsSync(updateConfigPath)) {
    logMain('warn', 'Skipping auto-updater because update config is missing', {
      updateConfigPath,
    });
    return false;
  }

  return true;
}

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logMain('info', 'Update available', { version: String(info.version) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    logMain('info', 'Update downloaded', { version: String(info.version) });
    const dispatchPromise = mainWindow
      ? mainWindow.webContents.executeJavaScript(createUpdateReadyScript(String(info.version)))
      : null;
    void dispatchPromise?.catch(() => undefined);
  });

  autoUpdater.on('error', (error) => {
    logMain('error', 'Auto-updater error', { error: error.message });
  });

  void autoUpdater.checkForUpdates().catch(() => undefined);
  updaterInterval = setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, AUTO_UPDATE_POLL_INTERVAL_MS);
}

export function registerUpdateInstallHandler(): void {
  if (updateInstallRegistered) {
    return;
  }

  updateInstallRegistered = true;
  ipcMain.handle(IPC_CHANNELS.installUpdate, async (): Promise<UpdateInstallResponse> => {
    if (!updateReady) {
      return { ok: false, error: 'No downloaded update available' };
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
  });
}

export async function handleAppReady(loadServerModule: ServerModuleLoader = defaultServerModuleLoader): Promise<void> {
  logMain('info', 'Electron app ready');

  try {
    await startEmbeddedServer(loadServerModule);
    createWindow();
    createTray();

    if (shouldEnableAutoUpdater()) {
      setupAutoUpdater();
    }
  } catch (error) {
    logMain('error', 'Electron startup failed before window creation', {
      error: error instanceof Error ? error.message : String(error),
    });
    app.quit();
  }
}

export async function handleBeforeQuit(
  loadInstanceManager: InstanceManagerLoader = defaultInstanceManagerLoader,
): Promise<void> {
  logMain('info', 'Electron app quitting');

  if (updaterInterval) {
    clearInterval(updaterInterval);
    updaterInterval = null;
  }

  try {
    await loadInstanceManager().instanceManager.stopAll();
  } catch {
    // ignore if server not started
  }
}

export function initializeAppPaths(): void {
  app.setName(ELECTRON_APP_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(ELECTRON_APP_ID);
  }
  app.setPath('userData', path.join(app.getPath('appData'), ELECTRON_APP_NAME));
}

export function registerMainProcess(): void {
  if (mainProcessRegistered) {
    return;
  }

  mainProcessRegistered = true;
  initializeAppPaths();
  registerUpdateInstallHandler();

  app.on('ready', () => {
    void handleAppReady();
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });

  app.on('before-quit', () => {
    void handleBeforeQuit();
  });

  app.on('child-process-gone', (_event, details) => {
    logMain('error', 'Electron child process gone', details as unknown as Record<string, unknown>);
  });

  process.on('uncaughtException', (error) => {
    logMain('error', 'Uncaught exception in main process', { error: error.message, stack: error.stack });
  });

  process.on('unhandledRejection', (reason) => {
    logMain('error', 'Unhandled rejection in main process', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
