import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron';
import { existsSync } from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { autoUpdater } from 'electron-updater';

const APP_URL = 'http://127.0.0.1:3210/ui';
const IS_DEV = process.env['NODE_ENV'] === 'development';
const ICON_PATH = path.join(__dirname, '../../resources/icon.png');
const UPDATE_CONFIG_PATH = path.join(process.resourcesPath, 'app-update.yml');
const APP_NAME = 'Pro5 Chrome Manager';
const APP_ID = 'com.pro5chrome.manager';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverStarted = false;
let updateReady = false;

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));

function resolveMainLogDir(): string {
  const dataDir = process.env['DATA_DIR'];
  if (dataDir) {
    return path.join(path.resolve(dataDir), 'logs');
  }

  return path.join(app.getPath('userData'), 'logs');
}

async function writeMainLog(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    const logDir = resolveMainLogDir();
    await fsp.mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, 'electron-main.log');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {}),
    });
    await fsp.appendFile(logPath, `${entry}\n`, 'utf-8');
  } catch {
    // best-effort only
  }
}

function logMain(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  if (level === 'error') console.error(`[${new Date().toISOString()}] ${line}`);
  else if (level === 'warn') console.warn(`[${new Date().toISOString()}] ${line}`);
  else console.log(`[${new Date().toISOString()}] ${line}`);
  void writeMainLog(level, message, meta);
}

async function startServer(): Promise<void> {
  if (serverStarted) return;
  serverStarted = true;

  process.env['DATA_DIR'] = process.env['DATA_DIR'] || app.getPath('userData');

  const builtServerPath = path.join(__dirname, '../server/index.js');
  const sourceServerPath = path.join(__dirname, '../../src/server/index.ts');
  const serverPath = existsSync(builtServerPath) ? builtServerPath : sourceServerPath;

  try {
    require(serverPath);
    logMain('info', 'Embedded server started', { serverPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logMain('error', 'Failed to start embedded server', { error: msg, serverPath });
    app.quit();
  }
}

async function waitForBackendReady(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt++;
    try {
      const res = await fetch('http://127.0.0.1:3210/readyz');
      if (res.ok) {
        logMain('info', 'Backend ready for UI load', { attempt });
        return;
      }

      const payload = await res.json().catch(() => null) as { warnings?: string[]; status?: string } | null;
      logMain('warn', 'Backend not ready yet', {
        attempt,
        statusCode: res.status,
        backendStatus: payload?.status,
        warnings: payload?.warnings,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logMain('warn', 'Backend readiness probe failed', { attempt, error });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Backend did not become ready within ${timeoutMs}ms`);
}

function createWindow(): void {
  const icon = nativeImage.createFromPath(ICON_PATH).isEmpty()
    ? undefined
    : nativeImage.createFromPath(ICON_PATH);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Pro5 Chrome Manager',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  void waitForBackendReady()
    .then(() => mainWindow?.loadURL(APP_URL))
    .then(() => {
      logMain('info', 'Main window loaded UI');
      mainWindow?.show();
    })
    .catch((err) => {
      const error = err instanceof Error ? err.message : String(err);
      logMain('error', 'Main window failed to load UI', { error, appUrl: APP_URL });
      mainWindow?.show();
      mainWindow?.loadURL(APP_URL).catch(() => undefined);
    });

  mainWindow.on('close', (e) => {
    if (tray && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
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
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray(): void {
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Pro5 Chrome Manager');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mở Pro5 Chrome Manager',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Thoát',
      click: () => {
        tray?.destroy();
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
  });
}

function shouldEnableAutoUpdater(): boolean {
  if (IS_DEV) {
    return false;
  }

  if (!existsSync(UPDATE_CONFIG_PATH)) {
    logMain('warn', 'Skipping auto-updater because update config is missing', {
      updateConfigPath: UPDATE_CONFIG_PATH,
    });
    return false;
  }

  return true;
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logMain('info', 'Update available', { version: String(info.version) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    logMain('info', 'Update downloaded', { version: String(info.version) });
    mainWindow?.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('pro5:update-ready', { detail: { version: '${String(info.version)}' } }))`,
    ).catch(() => undefined);
  });

  autoUpdater.on('error', (err) => {
    logMain('error', 'Auto-updater error', { error: err.message });
  });

  void autoUpdater.checkForUpdates().catch(() => undefined);
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 24 * 60 * 60 * 1000);
}

ipcMain.handle('pro5:update-install', async () => {
  if (!updateReady) {
    return { ok: false, error: 'No downloaded update available' };
  }
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });
  return { ok: true };
});

app.on('ready', () => {
  logMain('info', 'Electron app ready');
  void startServer()
    .then(() => {
      createWindow();
      createTray();

      if (shouldEnableAutoUpdater()) {
        setupAutoUpdater();
      }
    })
    .catch((err) => {
      const error = err instanceof Error ? err.message : String(err);
      logMain('error', 'Electron startup failed before window creation', { error });
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', async () => {
  logMain('info', 'Electron app quitting');
  try {
    const { instanceManager } = require('../server/features/instances/InstanceManager') as
      { instanceManager: { stopAll: () => Promise<void> } };
    await instanceManager.stopAll();
  } catch {
    // ignore if server not started
  }
});

app.on('child-process-gone', (_event, details) => {
  logMain('error', 'Electron child process gone', details as unknown as Record<string, unknown>);
});

process.on('uncaughtException', (err) => {
  logMain('error', 'Uncaught exception in main process', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logMain('error', 'Unhandled rejection in main process', {
    error: message,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
