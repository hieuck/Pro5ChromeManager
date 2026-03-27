import http from 'http';
import type { Express } from 'express';
import { configManager } from '../../features/config/ConfigManager';
import { wsServer } from '../realtime/wsServer';
import { loggerService } from '../logging/LoggerService';
import { bootState } from './bootState';
import { trackError } from '../monitoring/metrics';

let httpServerRef: http.Server | null = null;
let shutdownRegistered = false;
let shuttingDown = false;
let startPromise: Promise<void> | null = null;

interface InitializationStep {
  readonly name: string;
  readonly run: () => Promise<void>;
}

async function runInitializationStep(step: InitializationStep): Promise<void> {
  const startedAt = Date.now();
  try {
    await step.run();
    loggerService.performance(`Manager initialized: ${step.name}`, Date.now() - startedAt);
  } catch (error) {
    loggerService.error('Manager initialization failed', error, {
      step: step.name,
      durationMs: Date.now() - startedAt,
    });
    trackError('INTERNAL_SERVER_ERROR', 'high');
    throw error;
  }
}

async function initializeManagers(): Promise<void> {
  const totalStartedAt = Date.now();
  const steps: InitializationStep[] = [
    {
      name: 'configManager',
      run: () => configManager.load(),
    },
    {
      name: 'fingerprintEngine',
      run: async () => {
        const { fingerprintEngine } = await import('../../features/profiles/FingerprintEngine');
        await fingerprintEngine.initialize();
      },
    },
    {
      name: 'runtimeManager',
      run: async () => {
        const { runtimeManager } = await import('../../features/runtimes/RuntimeManager');
        await runtimeManager.initialize();
      },
    },
    {
      name: 'profileManager',
      run: async () => {
        const { profileManager } = await import('../../features/profiles/ProfileManager');
        await profileManager.initialize();
      },
    },
    {
      name: 'proxyManager',
      run: async () => {
        const { proxyManager } = await import('../../features/proxies/ProxyManager');
        await proxyManager.initialize();
      },
    },
    {
      name: 'extensionManager',
      run: async () => {
        const { extensionManager } = await import('../../features/extensions/ExtensionManager');
        await extensionManager.initialize();
      },
    },
    {
      name: 'browserCoreManager',
      run: async () => {
        const { browserCoreManager } = await import('../../features/browser-cores/BrowserCoreManager');
        await browserCoreManager.initialize();
      },
    },
    {
      name: 'usageMetricsManager',
      run: async () => {
        const { usageMetricsManager } = await import('../../core/telemetry/UsageMetricsManager');
        await usageMetricsManager.initialize();
      },
    },
    {
      name: 'onboardingStateManager',
      run: async () => {
        const { onboardingStateManager } = await import('../../features/support/OnboardingStateManager');
        await onboardingStateManager.initialize();
      },
    },
    {
      name: 'instanceManager',
      run: async () => {
        const { instanceManager } = await import('../../features/instances/InstanceManager');
        await instanceManager.initialize();
      },
    },
    {
      name: 'backupManager.autoBackup',
      run: async () => {
        const { backupManager } = await import('../../features/backups/BackupManager');
        backupManager.startAutoBackup();
      },
    },
  ];

  for (const step of steps) {
    await runInitializationStep(step);
  }

  loggerService.performance('All managers initialized', Date.now() - totalStartedAt, {
    stepCount: steps.length,
  });
}

export async function startServer(app: Express): Promise<void> {
  if (startPromise) {
    loggerService.warn('Start server joined in-flight startup operation');
    return startPromise;
  }

  if (httpServerRef) {
    loggerService.warn('Start server skipped because HTTP server is already initialized');
    return;
  }

  startPromise = (async () => {
    await initializeManagers();

    const { host, port } = configManager.get().api;
    const httpServer = http.createServer(app);
    httpServerRef = httpServer;
    wsServer.attach(httpServer);

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        httpServer.off('listening', onListening);
        bootState.ready = false;
        bootState.lastError = error.message;
        wsServer.close();
        httpServerRef = null;
        loggerService.error('Failed to start server', error, { host, port });
        reject(error);
      };

      const onListening = (): void => {
        httpServer.off('error', onError);
        bootState.ready = true;
        bootState.lastError = null;
        loggerService.info('API server running', { host, port });
        loggerService.info('WebSocket server running', { host, port, path: '/ws' });
        resolve();
      };

      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, host);
    });
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

export async function stopServer(reason = 'shutdown'): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  bootState.ready = false;
  bootState.lastError = `Stopped: ${reason}`;

  loggerService.warn('Stopping server', { reason });

  try {
    const { instanceManager } = await import('../../features/instances/InstanceManager');
    await instanceManager.stopAll();
  } catch (error) {
    loggerService.warn('Failed to stop Chromium instances during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (httpServerRef) {
    wsServer.close();
    await new Promise<void>((resolve, reject) => {
      httpServerRef?.close((error) => (error ? reject(error) : resolve()));
    }).catch((error) => {
      loggerService.warn('Failed to close HTTP server cleanly', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    httpServerRef = null;
  }

  shuttingDown = false;
}

export function registerProcessHandlers(stop: (reason?: string) => Promise<void>): void {
  if (shutdownRegistered) {
    return;
  }

  shutdownRegistered = true;

  process.on('SIGINT', () => {
    void stop('SIGINT').finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void stop('SIGTERM').finally(() => process.exit(0));
  });

  process.on('uncaughtException', (error) => {
    bootState.lastError = error.message;
    loggerService.logUncaughtException(error);
    trackError('INTERNAL_SERVER_ERROR', 'high');
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    bootState.lastError = message;
    loggerService.error('Unhandled rejection in server process', reason);
    trackError('INTERNAL_SERVER_ERROR', 'high');
  });
}
