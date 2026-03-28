import type { NextFunction, Request, Response } from 'express';
import { BaseError, ErrorCodes, isOperationalError } from '../errors';
import { getErrorMessage, getErrorStatusCode, sendError } from '../http';
import { loggerService } from './LoggerService';

export function errorHandlerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const correlationId = req.correlationId;
  let statusCode = getErrorStatusCode(error);
  let errorCode = ErrorCodes.INTERNAL_SERVER_ERROR;
  let message = getErrorMessage(error);
  let context: Record<string, unknown> | undefined;

  if (error instanceof BaseError) {
    statusCode = error.statusCode;
    errorCode = error.code as ErrorCodes;
    message = error.message;
    context = error.context;
  } else if (statusCode === 413) {
    errorCode = 'PAYLOAD_TOO_LARGE' as ErrorCodes;
    message = 'Payload too large';
  } else {
    loggerService.error('Unexpected error occurred', error, {
      correlationId,
      method: req.method,
      path: req.path,
    });
  }

  sendError(
    res,
    statusCode,
    message,
    errorCode,
    process.env['PRO5_DEBUG_ERROR_CONTEXT'] === 'true' ? context : undefined,
  );

  if (isOperationalError(error)) {
    loggerService.warn('Operational error', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  loggerService.error('Programmer error - requires immediate attention', error, {
    correlationId,
    stack: error.stack,
  });

  if (process.env.NODE_ENV === 'production' && process.env['PRO5_ENABLE_ERROR_REPORTING'] === 'true') {
    notifyErrorReportingService(error, req, correlationId);
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new BaseError(`Route not found: ${req.method} ${req.url}`, {
    code: ErrorCodes.NOT_FOUND,
    statusCode: 404,
    correlationId: req.correlationId,
    context: {
      method: req.method,
      url: req.url,
    },
  }));
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function notifyErrorReportingService(error: Error, req: Request, correlationId?: string): void {
  loggerService.warn('Error reporting provider is not configured', {
    correlationId,
    method: req.method,
    path: req.path,
    error: error.message,
    provider: process.env['PRO5_ERROR_REPORTER'] ?? 'none',
  });
}
