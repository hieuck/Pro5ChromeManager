import { Express } from 'express';
import backupRoutes from '../../../routes/backups';
import browserCoreRoutes from '../../../routes/browserCores';
import configRoutes from '../../../routes/config';
import extensionRoutes from '../../../routes/extensions';
import instanceRoutes from '../../../routes/instances';
import profileRoutes from '../../../routes/profiles';
import proxyRoutes from '../../../routes/proxies';
import runtimeRoutes from '../../../routes/runtimes';
import supportRoutes from '../../../routes/support';

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
