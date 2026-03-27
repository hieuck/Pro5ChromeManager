import { Response } from 'express';
import { ZodError } from 'zod';
import { BaseError } from './errors/BaseError';

type HttpLikeError = {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

function getHttpLikeStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = error as HttpLikeError;
  const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
  if (typeof status !== 'number' || !Number.isInteger(status)) {
    return undefined;
  }
  if (status < 400 || status > 599) {
    return undefined;
  }
  return status;
}

export function sendSuccess<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data });
}

export function sendError(
  response: Response,
  status: number,
  error: string,
  code?: string,
  details?: unknown,
): void {
  const correlationId = response.locals.correlationId as string | undefined;
  response.status(status).json({
    success: false,
    error,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    ...(code ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('not found');
}

export function getErrorStatusCode(error: unknown): number {
  if (error instanceof BaseError) {
    return error.statusCode;
  }
  const httpStatus = getHttpLikeStatus(error);
  if (httpStatus !== undefined) {
    return httpStatus;
  }
  if (error instanceof ZodError) {
    return 400;
  }
  return 500;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    return error.message;
  }
  if (getHttpLikeStatus(error) === 413) {
    return 'Payload too large';
  }
  if (error instanceof ZodError) {
    return 'Validation failed';
  }
  return 'Internal server error';
}
