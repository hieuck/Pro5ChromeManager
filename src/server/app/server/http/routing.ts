import { Express } from 'express';
import backupRoutes from '../../../routes/backups.routes';
import browserCoreRoutes from '../../../routes/browserCores.routes';
import configRoutes from '../../../routes/config.routes';
import extensionRoutes from '../../../routes/extensions.routes';
import instanceRoutes from '../../../routes/instances.routes';
import profileRoutes from '../../../routes/profiles.routes';
import proxyRoutes from '../../../routes/proxies.routes';
import runtimeRoutes from '../../../routes/runtimes.routes';
import supportRoutes from '../../../routes/support.routes';

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
