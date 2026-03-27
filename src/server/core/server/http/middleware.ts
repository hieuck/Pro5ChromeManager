import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logManager } from '../../logging/LogManager';
import { loggerService } from '../../logging/LoggerService';
import { sendError, sendSuccess, getErrorStatusCode, getErrorMessage } from '../../http';
import { BaseError } from '../../errors';
import { prometheusMiddleware, setupMetricsEndpoint, trackError } from '../../monitoring/metrics';
import { asyncHandler, errorHandlerMiddleware, notFoundHandler } from '../../logging/errorHandler';

const logsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});

export function registerCoreMiddleware(app: Express): void {
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(prometheusMiddleware);
  setupMetricsEndpoint(app);

  app.use((request: Request, response: Response, next: NextFunction) => {
    const correlationId = request.header('x-correlation-id') ?? loggerService.generateCorrelationId();
    request.correlationId = correlationId;
    response.locals.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    next();
  });

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
    const correlationId = response.locals.correlationId as string | undefined;
    response.on('finish', () => {
      loggerService.http('HTTP request completed', {
        correlationId,
        method: request.method,
        path: request.path,
        route: request.route?.path ?? null,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });
}

export function registerLogsEndpoint(app: Express): void {
  app.get('/api/logs', logsRateLimiter, asyncHandler(async (_request: Request, response: Response) => {
    const entries = await logManager.loadOpsLogEntries(200);
    sendSuccess(response, entries);
  }));
}

export function registerErrorHandler(app: Express): void {
  app.use(notFoundHandler);
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    const statusCode = getErrorStatusCode(error);
    const errorCode = error instanceof BaseError ? error.code : 'INTERNAL_SERVER_ERROR';
    const severity = statusCode >= 500 ? 'high' : statusCode >= 400 ? 'medium' : 'low';

    trackError(errorCode, severity);
    errorHandlerMiddleware(error instanceof Error ? error : new Error(getErrorMessage(error)), request, response, next);
  });
}
