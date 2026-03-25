import { Express } from 'express';
import backupRoutes from '../../../features/backups';
import browserCoreRoutes from '../../../features/browser-cores';
import configRoutes from '../../../features/config';
import extensionRoutes from '../../../features/extensions';
import instanceRoutes from '../../../features/instances';
import profileRoutes from '../../../features/profiles';
import proxyRoutes from '../../../features/proxies';
import runtimeRoutes from '../../../features/runtimes';
import supportRoutes from '../../../features/support';

const apiRoutes = [
  configRoutes,
  profileRoutes,
  proxyRoutes,
  extensionRoutes,
  runtimeRoutes,
  browserCoreRoutes,
  instanceRoutes,
  backupRoutes,
  supportRoutes,
];

export function registerApiRoutes(app: Express): void {
  for (const route of apiRoutes) {
    app.use('/api', route);
  }
}
