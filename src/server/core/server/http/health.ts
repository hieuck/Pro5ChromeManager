import { Express, Request, Response } from 'express';
import { configManager } from '../../../features/config/ConfigManager';
import { dataPath } from '../../fs/dataPaths';
import { bootState } from '../bootState';
import { loggerService } from '../../logging/LoggerService';
import { sendError, sendSuccess } from '../../http';

export function registerHealthEndpoints(app: Express): void {
  app.get('/health', (_req: Request, response: Response) => {
    const correlationId = (response.locals.correlationId as string | undefined) ?? loggerService.generateCorrelationId();
    loggerService.debug('Basic health check requested', { correlationId });

    response.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'pro5-chrome-manager',
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: process.uptime(),
    });
  });

  app.get('/readyz', async (_req: Request, response: Response) => {
    const correlationId = (response.locals.correlationId as string | undefined) ?? loggerService.generateCorrelationId();
    try {
      const { runtimeManager } = await import('../../../features/runtimes/RuntimeManager');
      const { profileManager } = await import('../../../features/profiles/ProfileManager');
      const { proxyManager } = await import('../../../features/proxies/ProxyManager');

      const runtimes = runtimeManager.listRuntimes();
      const profiles = profileManager.listProfiles();
      const proxies = proxyManager.listProxies();
      const availableRuntimeCount = runtimes.filter((runtime) => runtime.available).length;
      const config = configManager.get();
      const warnings = [
        bootState.lastError ? `Last startup error: ${bootState.lastError}` : null,
        availableRuntimeCount === 0 ? 'No available browser runtime detected.' : null,
      ].filter((item): item is string => Boolean(item));

      const payload = {
        status: warnings.length === 0 ? 'ready' : 'degraded',
        bootReady: bootState.ready,
        startedAt: bootState.startedAt,
        lastError: bootState.lastError,
        api: config.api,
        dataDir: dataPath(),
        profileCount: profiles.length,
        proxyCount: proxies.length,
        runtimeCount: runtimes.length,
        availableRuntimeCount,
        warnings,
        timestamp: new Date().toISOString(),
      };

      const statusCode = warnings.length === 0 ? 200 : 503;
      loggerService.info('Readiness check completed', {
        correlationId,
        status: payload.status,
        statusCode,
        profileCount: payload.profileCount,
        proxyCount: payload.proxyCount,
      });

      response.status(statusCode).json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loggerService.error('Readiness check failed', error, { correlationId });

      sendError(response, 503, 'Service not ready', 'SERVICE_UNAVAILABLE', {
        status: 'not_ready',
        bootReady: bootState.ready,
        startedAt: bootState.startedAt,
        lastError: message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get('/alive', (_req: Request, response: Response) => {
    const correlationId = (response.locals.correlationId as string | undefined) ?? loggerService.generateCorrelationId();
    loggerService.debug('Liveness check requested', { correlationId });

    response.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/metrics', async (_req: Request, response: Response) => {
    const correlationId = (response.locals.correlationId as string | undefined) ?? loggerService.generateCorrelationId();
    try {
      const { runtimeManager } = await import('../../../features/runtimes/RuntimeManager');
      const { profileManager } = await import('../../../features/profiles/ProfileManager');
      const { proxyManager } = await import('../../../features/proxies/ProxyManager');
      const { extensionManager } = await import('../../../features/extensions/ExtensionManager');

      const metrics = {
        timestamp: new Date().toISOString(),
        process: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
        application: {
          profiles: profileManager.listProfiles().length,
          proxies: proxyManager.listProxies().length,
          extensions: extensionManager.listExtensions().length,
          runtimes: runtimeManager.listRuntimes().length,
          availableRuntimes: runtimeManager.listRuntimes().filter((r) => r.available).length,
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      };

      loggerService.debug('Metrics collected', {
        correlationId,
        profileCount: metrics.application.profiles,
        proxyCount: metrics.application.proxies,
      });

      sendSuccess(response, metrics);
    } catch (error) {
      loggerService.error('Metrics collection failed', error, { correlationId });
      sendError(response, 500, 'Failed to collect metrics', 'INTERNAL_SERVER_ERROR', {
        timestamp: new Date().toISOString(),
        prometheusEndpoint: '/metrics/prometheus',
      });
    }
  });
}
