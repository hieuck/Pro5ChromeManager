import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_URL = 'http://127.0.0.1:3210/ui';
const IS_DEV = process.env['NODE_ENV'] === 'development';
const ICON_PATH = path.join(__dirname, '../../resources/icon.png');

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverStarted = false;

// ─── Start Express server ─────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  if (serverStarted) return;
  serverStarted = true;

  // Override data directory to Electron's userData path
  const dataDir = app.getPath('userData');
  process.env['DATA_DIR'] = dataDir;

  // Dynamically require the compiled server
  const serverPath = IS_DEV
    ? path.join(__dirname, '../../src/server/index.ts')
    : path.join(__dirname, '../server/index.js');

  try {
    require(serverPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] Failed to start server:`, msg);
    app.quit();
  }
}

// ─── Create window ────────────────────────────────────────────────────────────

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

  // Wait for server to be ready, then load UI
  let attempts = 0;
  const tryLoad = (): void => {
    attempts++;
    mainWindow?.loadURL(APP_URL).then(() => {
      mainWindow?.show();
    }).catch(() => {
      if (attempts < 20) {
        setTimeout(tryLoad, 500);
      } else {
        mainWindow?.show();
        mainWindow?.loadURL(APP_URL).catch(() => undefined);
      }
    });
  };
  setTimeout(tryLoad, 1000);

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    if (tray && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

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

// ─── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`[${new Date().toISOString()}] Update available: ${String(info.version)}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[${new Date().toISOString()}] Update downloaded: ${String(info.version)}`);
    // Notify renderer via loadURL with query param — simple approach
    mainWindow?.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('pro5:update-ready', { detail: { version: '${String(info.version)}' } }))`,
    ).catch(() => undefined);
  });

  autoUpdater.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Auto-updater error:`, err.message);
  });

  // Check on startup + every 24h
  void autoUpdater.checkForUpdates().catch(() => undefined);
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 24 * 60 * 60 * 1000);
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', () => {
  void startServer();
  createWindow();
  createTray();

  if (!IS_DEV) {
    setupAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows/Linux
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', async () => {
  // Gracefully stop all Chromium instances before exit
  try {
    const { instanceManager } = require('../server/managers/InstanceManager') as
      { instanceManager: { stopAll: () => Promise<void> } };
    await instanceManager.stopAll();
  } catch { /* ignore if server not started */ }
});

// Catch uncaught exceptions in main process
process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception in main process:`, err.message);
});
