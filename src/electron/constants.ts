export const ELECTRON_APP_NAME = 'Pro5 Chrome Manager';
export const ELECTRON_APP_ID = 'com.pro5chrome.manager';
export const PRELOAD_GLOBAL_KEY = '__pro5__';
export const PRELOAD_FALLBACK_VERSION = '1.0.0';

export const IPC_CHANNELS = {
  installUpdate: 'pro5:update-install',
} as const;

export const WINDOW_EVENTS = {
  updateReady: 'pro5:update-ready',
} as const;

export const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:3210';
export const UI_ROUTE_PATH = '/ui';
export const READY_ROUTE_PATH = '/readyz';

export const WINDOW_SIZE = {
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
} as const;

export const BACKEND_READY_TIMEOUT_MS = 15_000;
export const BACKEND_READY_RETRY_INTERVAL_MS = 500;
export const AUTO_UPDATE_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PROCESS_EXIT_SUCCESS_CODE = 0;

export const MAIN_LOG_DIRECTORY_NAME = 'logs';
export const MAIN_LOG_FILE_NAME = 'electron-main.log';

export const ELECTRON_RELATIVE_PATHS = {
  icon: '../../resources/icon.png',
  preload: 'preload.js',
  builtServer: '../server/index.js',
  sourceServer: '../../src/server/index.ts',
  instanceManager: '../server/features/instances/InstanceManager',
  updateConfig: 'app-update.yml',
} as const;

export const SUPPORTED_ELECTRON_LOCALES = {
  english: 'en',
  vietnamese: 'vi',
} as const;
