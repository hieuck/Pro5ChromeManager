import express, { Express, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logManager } from '../../../managers/LogManager';
import { logger } from '../../logging/logger';
import { sendError, sendSuccess } from '../../http';

const logsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});

export function registerCoreMiddleware(app: Express): void {
  app.use(express.json());

  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin ?? '';
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      response.setHeader('Access-Control-Allow-Origin', origin || '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }

    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }

    next();
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    response.on('finish', () => {
      logger.info(`${request.method} ${request.path} ${response.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  });
}

export function registerLogsEndpoint(app: Express): void {
  app.get('/api/logs', logsRateLimiter, async (_request: Request, response: Response) => {
    try {
      const entries = await logManager.loadOpsLogEntries(200);
      sendSuccess(response, entries);
    } catch {
      sendError(response, 500, 'Failed to read logs');
    }
  });
}

export function registerErrorHandler(app: Express): void {
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) });
    sendError(response, 500, 'Internal server error');
  });
}
