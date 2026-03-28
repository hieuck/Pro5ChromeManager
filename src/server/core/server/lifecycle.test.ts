import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';

const mocks = vi.hoisted(() => {
  type FakeHttpServer = EventEmitter & {
    listen: (port: number, host: string) => void;
    close: (callback?: (error?: Error | null) => void) => void;
  };

  const bootState = {
    ready: false,
    startedAt: '2026-01-01T00:00:00.000Z',
    lastError: null as string | null,
  };

  const loggerService = {
    performance: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    logUncaughtException: vi.fn(),
  };

  const httpState: {
    listenMode: 'success' | 'error' | 'manual';
    listenError: Error;
    closeError: Error | null;
    lastServer: FakeHttpServer | null;
  } = {
    listenMode: 'success',
    listenError: new Error('listen failed'),
    closeError: null,
    lastServer: null,
  };

  const createServer = vi.fn((_app: Express) => {
    const server = new EventEmitter() as FakeHttpServer;
    server.listen = (_port: number, _host: string) => {
      if (httpState.listenMode === 'manual') {
        return;
      }

      queueMicrotask(() => {
        if (httpState.listenMode === 'error') {
          server.emit('error', httpState.listenError);
          return;
        }
        server.emit('listening');
      });
    };
    server.close = (callback?: (error?: Error | null) => void) => {
      queueMicrotask(() => callback?.(httpState.closeError));
    };
    httpState.lastServer = server;
    return server;
  });

  return {
    bootState,
    loggerService,
    httpState,
    createServer,
    wsAttach: vi.fn(),
    wsClose: vi.fn(),
    trackError: vi.fn(),
    configLoad: vi.fn().mockResolvedValue(undefined),
    configGet: vi.fn(() => ({ api: { host: '127.0.0.1', port: 3210 } })),
    fingerprintInitialize: vi.fn().mockResolvedValue(undefined),
    runtimeInitialize: vi.fn().mockResolvedValue(undefined),
    profileInitialize: vi.fn().mockResolvedValue(undefined),
    proxyInitialize: vi.fn().mockResolvedValue(undefined),
    extensionInitialize: vi.fn().mockResolvedValue(undefined),
    browserCoreInitialize: vi.fn().mockResolvedValue(undefined),
    usageInitialize: vi.fn().mockResolvedValue(undefined),
    onboardingInitialize: vi.fn().mockResolvedValue(undefined),
    instanceInitialize: vi.fn().mockResolvedValue(undefined),
    instanceStopAll: vi.fn().mockResolvedValue(undefined),
    backupStartAutoBackup: vi.fn(),
  };
});

vi.mock('http', () => ({
  default: {
    createServer: mocks.createServer,
  },
  createServer: mocks.createServer,
}));

vi.mock('../../features/config/ConfigManager', () => ({
  configManager: {
    load: mocks.configLoad,
    get: mocks.configGet,
  },
}));

vi.mock('../realtime/wsServer', () => ({
  wsServer: {
    attach: mocks.wsAttach,
    close: mocks.wsClose,
  },
}));

vi.mock('../logging/LoggerService', () => ({
  loggerService: mocks.loggerService,
}));

vi.mock('./bootState', () => ({
  bootState: mocks.bootState,
}));

vi.mock('../monitoring/metrics', () => ({
  trackError: mocks.trackError,
}));

vi.mock('../../features/profiles/FingerprintEngine', () => ({
  fingerprintEngine: {
    initialize: mocks.fingerprintInitialize,
  },
}));

vi.mock('../../features/runtimes/RuntimeManager', () => ({
  runtimeManager: {
    initialize: mocks.runtimeInitialize,
  },
}));

vi.mock('../../features/profiles/ProfileManager', () => ({
  profileManager: {
    initialize: mocks.profileInitialize,
  },
}));

vi.mock('../../features/proxies/ProxyManager', () => ({
  proxyManager: {
    initialize: mocks.proxyInitialize,
  },
}));

vi.mock('../../features/extensions/ExtensionManager', () => ({
  extensionManager: {
    initialize: mocks.extensionInitialize,
  },
}));

vi.mock('../../features/browser-cores/BrowserCoreManager', () => ({
  browserCoreManager: {
    initialize: mocks.browserCoreInitialize,
  },
}));

vi.mock('../../core/telemetry/UsageMetricsManager', () => ({
  usageMetricsManager: {
    initialize: mocks.usageInitialize,
  },
}));

vi.mock('../../features/support/OnboardingStateManager', () => ({
  onboardingStateManager: {
    initialize: mocks.onboardingInitialize,
  },
}));

vi.mock('../../features/instances/InstanceManager', () => ({
  instanceManager: {
    initialize: mocks.instanceInitialize,
    stopAll: mocks.instanceStopAll,
  },
}));

vi.mock('../../features/backups/BackupManager', () => ({
  backupManager: {
    startAutoBackup: mocks.backupStartAutoBackup,
  },
}));

async function importLifecycle() {
  return import('./lifecycle');
}

async function waitForServerCreation(): Promise<NonNullable<typeof mocks.httpState.lastServer>> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (mocks.httpState.lastServer) {
      return mocks.httpState.lastServer;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('HTTP server was not created');
}

describe('server lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    mocks.bootState.ready = false;
    mocks.bootState.lastError = null;
    mocks.httpState.listenMode = 'success';
    mocks.httpState.listenError = new Error('listen failed');
    mocks.httpState.closeError = null;
    mocks.httpState.lastServer = null;

    mocks.createServer.mockClear();
    mocks.wsAttach.mockClear();
    mocks.wsClose.mockClear();
    mocks.trackError.mockClear();
    mocks.configLoad.mockClear();
    mocks.configGet.mockClear();
    mocks.loggerService.performance.mockClear();
    mocks.loggerService.error.mockClear();
    mocks.loggerService.warn.mockClear();
    mocks.loggerService.info.mockClear();
    mocks.loggerService.logUncaughtException.mockClear();
    mocks.fingerprintInitialize.mockClear();
    mocks.runtimeInitialize.mockClear();
    mocks.profileInitialize.mockClear();
    mocks.proxyInitialize.mockClear();
    mocks.extensionInitialize.mockClear();
    mocks.browserCoreInitialize.mockClear();
    mocks.usageInitialize.mockClear();
    mocks.onboardingInitialize.mockClear();
    mocks.instanceInitialize.mockClear();
    mocks.instanceStopAll.mockClear();
    mocks.backupStartAutoBackup.mockClear();
  });

  it('starts the HTTP and WebSocket servers after every manager initializes', async () => {
    const { startServer } = await importLifecycle();

    await startServer({} as Express);

    expect(mocks.configLoad).toHaveBeenCalledOnce();
    expect(mocks.fingerprintInitialize).toHaveBeenCalledOnce();
    expect(mocks.runtimeInitialize).toHaveBeenCalledOnce();
    expect(mocks.profileInitialize).toHaveBeenCalledOnce();
    expect(mocks.proxyInitialize).toHaveBeenCalledOnce();
    expect(mocks.extensionInitialize).toHaveBeenCalledOnce();
    expect(mocks.browserCoreInitialize).toHaveBeenCalledOnce();
    expect(mocks.usageInitialize).toHaveBeenCalledOnce();
    expect(mocks.onboardingInitialize).toHaveBeenCalledOnce();
    expect(mocks.instanceInitialize).toHaveBeenCalledOnce();
    expect(mocks.backupStartAutoBackup).toHaveBeenCalledOnce();
    expect(mocks.wsAttach).toHaveBeenCalledWith(mocks.httpState.lastServer);
    expect(mocks.bootState.ready).toBe(true);
    expect(mocks.bootState.lastError).toBeNull();
  });

  it('joins an in-flight startup instead of starting twice', async () => {
    const { startServer } = await importLifecycle();

    const first = startServer({} as Express);
    const second = startServer({} as Express);
    await Promise.all([first, second]);

    expect(mocks.createServer).toHaveBeenCalledTimes(1);
    expect(mocks.loggerService.warn).toHaveBeenCalledWith('Start server joined in-flight startup operation');
  });

  it('records boot failure details when the HTTP server cannot start', async () => {
    mocks.httpState.listenMode = 'manual';
    mocks.httpState.listenError = new Error('port in use');
    const { startServer } = await importLifecycle();
    const startup = startServer({} as Express);
    const startupError = startup.catch((error) => error);
    const server = await waitForServerCreation();
    server.emit('error', mocks.httpState.listenError);
    const error = await startupError;

    expect(error).toBe(mocks.httpState.listenError);
    expect(mocks.bootState.ready).toBe(false);
    expect(mocks.bootState.lastError).toBe('port in use');
    expect(mocks.wsClose).toHaveBeenCalledOnce();
    expect(mocks.loggerService.error).toHaveBeenCalledWith('Failed to start server', mocks.httpState.listenError, {
      host: '127.0.0.1',
      port: 3210,
    });
  });

  it('stops instances and closes the HTTP server on shutdown', async () => {
    const { startServer, stopServer } = await importLifecycle();

    await startServer({} as Express);
    await stopServer('tests');

    expect(mocks.instanceStopAll).toHaveBeenCalledOnce();
    expect(mocks.wsClose).toHaveBeenCalledTimes(1);
    expect(mocks.bootState.ready).toBe(false);
    expect(mocks.bootState.lastError).toBe('Stopped: tests');
  });

  it('keeps shutdown resilient when instance or HTTP shutdown fails', async () => {
    const { startServer, stopServer } = await importLifecycle();
    mocks.instanceStopAll.mockRejectedValueOnce(new Error('instance failure'));
    mocks.httpState.closeError = new Error('close failure');

    await startServer({} as Express);
    await stopServer('tests');

    expect(mocks.loggerService.warn).toHaveBeenCalledWith('Failed to stop Chromium instances during shutdown', {
      error: 'instance failure',
    });
    expect(mocks.loggerService.warn).toHaveBeenCalledWith('Failed to close HTTP server cleanly', {
      error: 'close failure',
    });
  });

  it('registers process handlers once and routes fatal errors through boot state and telemetry', async () => {
    const { registerProcessHandlers } = await importLifecycle();
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return process;
    }) as typeof process.on);
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => undefined) as never);
    const stop = vi.fn().mockResolvedValue(undefined);

    registerProcessHandlers(stop);
    registerProcessHandlers(stop);

    expect(processOnSpy).toHaveBeenCalledTimes(4);

    handlers.get('SIGINT')?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledWith('SIGINT');
    expect(processExitSpy).toHaveBeenCalledWith(0);

    handlers.get('SIGTERM')?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledWith('SIGTERM');

    const uncaught = new Error('uncaught failure');
    handlers.get('uncaughtException')?.(uncaught);
    expect(mocks.bootState.lastError).toBe('uncaught failure');
    expect(mocks.loggerService.logUncaughtException).toHaveBeenCalledWith(uncaught);
    expect(mocks.trackError).toHaveBeenCalledWith('INTERNAL_SERVER_ERROR', 'high');

    handlers.get('unhandledRejection')?.('rejected value');
    expect(mocks.bootState.lastError).toBe('rejected value');
    expect(mocks.loggerService.error).toHaveBeenCalledWith('Unhandled rejection in server process', 'rejected value');
    expect(mocks.trackError).toHaveBeenCalledWith('INTERNAL_SERVER_ERROR', 'high');
  });
});
