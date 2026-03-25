import express from 'express';
import {
  bootState,
  registerApiRoutes,
  registerCoreMiddleware,
  registerErrorHandler,
  registerHealthEndpoints,
  registerLogsEndpoint,
  registerProcessHandlers,
  registerUiRoutes,
  startServer,
  stopServer,
} from './core/server';
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
