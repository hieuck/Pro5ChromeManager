import express from 'express';
import { bootState } from './app/server/bootState';
import { registerHealthEndpoints } from './app/server/http/health';
import { registerCoreMiddleware, registerErrorHandler, registerLogsEndpoint } from './app/server/http/middleware';
import { registerApiRoutes } from './app/server/http/routing';
import { registerUiRoutes } from './app/server/http/ui';
import { registerProcessHandlers, startServer, stopServer } from './app/server/lifecycle';
import { logger } from './utils/logger';

const app = express();

registerCoreMiddleware(app);
registerHealthEndpoints(app);
registerApiRoutes(app);
registerLogsEndpoint(app);
registerUiRoutes(app);
registerErrorHandler(app);

async function start(): Promise<void> {
  await startServer(app);
}

async function stop(reason = 'shutdown'): Promise<void> {
  await stopServer(reason);
}

if (process.env['PRO5_SERVER_AUTOSTART'] !== 'false' && process.env['NODE_ENV'] !== 'test') {
  registerProcessHandlers(stop);
  start().catch((error) => {
    bootState.ready = false;
    bootState.lastError = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start server', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
}

export { app, start, stop, registerProcessHandlers };
