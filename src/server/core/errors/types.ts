import { BaseError } from './BaseError';

export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

export function isOperationalError(error: unknown): boolean {
  return isBaseError(error) && error.isOperational;
}

export function getErrorDetails(error: unknown): Record<string, unknown> {
  if (isBaseError(error)) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    message: String(error),
    timestamp: new Date().toISOString(),
  };
}
