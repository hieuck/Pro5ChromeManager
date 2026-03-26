import { Express, Request, Response } from 'express';
import { configManager } from '../../../features/config/ConfigManager';
import { dataPath } from '../../fs/dataPaths';
import { bootState } from '../bootState';

export function registerHealthEndpoints(app: Express): void {
  app.get('/health', (_request: Request, response: Response) => {
    response.json({
      status: 'ok',
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '1.0.0',
    });
  });

  app.get('/readyz', async (_request: Request, response: Response) => {
    try {
      const { runtimeManager } = await import('../../../features/runtimes/RuntimeManager');
      const { profileManager } = await import('../../../features/profiles/ProfileManager');
      const { proxyManager } = await import('../../../managers/ProxyManager');

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
      };

      response.status(warnings.length === 0 ? 200 : 503).json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(503).json({
        status: 'not_ready',
        bootReady: bootState.ready,
        startedAt: bootState.startedAt,
        lastError: message,
      });
    }
  });
}
