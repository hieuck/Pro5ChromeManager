import http from 'http';
import type { Express } from 'express';
import { configManager } from '../../managers/ConfigManager';
import { wsServer } from '../realtime/wsServer';
import { logger } from '../logging/logger';
import { bootState } from './bootState';

let httpServerRef: http.Server | null = null;
let shutdownRegistered = false;
let shuttingDown = false;

async function initializeManagers(): Promise<void> {
  await configManager.load();

  const { fingerprintEngine } = await import('../../managers/FingerprintEngine');
  await fingerprintEngine.initialize();

  const { runtimeManager } = await import('../../managers/RuntimeManager');
  await runtimeManager.initialize();

  const { profileManager } = await import('../../managers/ProfileManager');
  await profileManager.initialize();

  const { proxyManager } = await import('../../managers/ProxyManager');
  await proxyManager.initialize();

  const { extensionManager } = await import('../../managers/ExtensionManager');
  await extensionManager.initialize();

  const { browserCoreManager } = await import('../../managers/BrowserCoreManager');
  await browserCoreManager.initialize();

  const { usageMetricsManager } = await import('../../managers/UsageMetricsManager');
  await usageMetricsManager.initialize();

  const { onboardingStateManager } = await import('../../managers/OnboardingStateManager');
  await onboardingStateManager.initialize();

  const { instanceManager } = await import('../../managers/InstanceManager');
  await instanceManager.initialize();

  const { backupManager } = await import('../../managers/BackupManager');
  backupManager.startAutoBackup();
}

export async function startServer(app: Express): Promise<void> {
  await initializeManagers();

  const { host, port } = configManager.get().api;
  const httpServer = http.createServer(app);
  httpServerRef = httpServer;
  wsServer.attach(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      bootState.ready = true;
      bootState.lastError = null;
      logger.info(`API server running at http://${host}:${port}`);
      logger.info(`WebSocket server running at ws://${host}:${port}/ws`);
      resolve();
    });
  });
}

export async function stopServer(reason = 'shutdown'): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  bootState.ready = false;
  bootState.lastError = `Stopped: ${reason}`;

  logger.warn('Stopping server', { reason });

  try {
    const { instanceManager } = await import('../../managers/InstanceManager');
    await instanceManager.stopAll();
  } catch (error) {
    logger.warn('Failed to stop Chromium instances during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (httpServerRef) {
    await new Promise<void>((resolve, reject) => {
      httpServerRef?.close((error) => (error ? reject(error) : resolve()));
    }).catch((error) => {
      logger.warn('Failed to close HTTP server cleanly', {
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
    logger.error('Uncaught exception in server process', { error: error.message, stack: error.stack });
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    bootState.lastError = message;
    logger.error('Unhandled rejection in server process', {
      error: message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
