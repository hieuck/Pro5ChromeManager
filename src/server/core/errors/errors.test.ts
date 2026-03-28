import { describe, expect, it } from 'vitest';
import {
  BaseError,
  ConfigurationError,
  ConflictError,
  DatabaseError,
  ErrorCodes,
  FileSystemError,
  ForbiddenError,
  getErrorDetails,
  IntegrationError,
  InternalServerError,
  isBaseError,
  isOperationalError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from './index';

describe('server error models', () => {
  it('serializes BaseError metadata and supports immutable context enrichment', () => {
    const error = new BaseError('Boom', {
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      statusCode: 500,
      correlationId: 'corr-1',
      context: { feature: 'tests' },
    });

    const enriched = error.withContext({ attempt: 2 });

    expect(error.toJSON()).toMatchObject({
      name: 'BaseError',
      message: 'Boom',
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      statusCode: 500,
      isOperational: true,
      correlationId: 'corr-1',
      context: { feature: 'tests' },
    });
    expect(enriched).toBeInstanceOf(BaseError);
    expect(enriched.context).toEqual({ feature: 'tests', attempt: 2 });
    expect(error.context).toEqual({ feature: 'tests' });
  });

  it('exposes stable metadata across client and server error subclasses', () => {
    expect(new NotFoundError('Profile', 'p-1')).toMatchObject({
      code: ErrorCodes.NOT_FOUND,
      statusCode: 404,
      isOperational: true,
      context: { resource: 'Profile', identifier: 'p-1' },
    });

    expect(new ValidationError('Invalid value', { field: 'name', value: '' })).toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
      statusCode: 400,
      context: { field: 'name', value: '' },
    });

    expect(new UnauthorizedError()).toMatchObject({
      code: ErrorCodes.UNAUTHORIZED,
      statusCode: 401,
    });

    expect(new ForbiddenError()).toMatchObject({
      code: ErrorCodes.FORBIDDEN,
      statusCode: 403,
    });

    expect(new ConflictError('Duplicate')).toMatchObject({
      code: ErrorCodes.CONFLICT,
      statusCode: 409,
    });

    expect(new RateLimitError(undefined, { limit: 10, window: 60_000 })).toMatchObject({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      statusCode: 429,
      context: { limit: 10, window: 60_000 },
    });

    expect(new InternalServerError()).toMatchObject({
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      statusCode: 500,
      isOperational: false,
    });

    expect(new ServiceUnavailableError('Updater', { retryAfter: 30 })).toMatchObject({
      code: ErrorCodes.SERVICE_UNAVAILABLE,
      statusCode: 503,
      context: { service: 'Updater', retryAfter: 30 },
    });

    expect(new DatabaseError('save-profile', { originalError: new Error('db down') })).toMatchObject({
      code: ErrorCodes.DATABASE_ERROR,
      statusCode: 500,
      isOperational: false,
      context: { operation: 'save-profile', originalError: 'db down' },
    });

    expect(new FileSystemError('write', 'E:/data/file.json', { originalError: new Error('denied') })).toMatchObject({
      code: ErrorCodes.FILE_SYSTEM_ERROR,
      context: { operation: 'write', path: 'E:/data/file.json', originalError: 'denied' },
    });

    expect(new NetworkError('download', 'https://example.com', { originalError: new Error('timeout') })).toMatchObject({
      code: ErrorCodes.NETWORK_ERROR,
      context: { operation: 'download', target: 'https://example.com', originalError: 'timeout' },
    });

    expect(new IntegrationError('GitHub', 'sync', { originalError: new Error('401') })).toMatchObject({
      code: ErrorCodes.INTEGRATION_ERROR,
      context: { service: 'GitHub', operation: 'sync', originalError: '401' },
    });

    expect(new ConfigurationError('apiBaseUrl')).toMatchObject({
      code: ErrorCodes.CONFIGURATION_ERROR,
      context: { setting: 'apiBaseUrl' },
    });
  });

  it('detects base errors and normalizes arbitrary error details', () => {
    const baseError = new ConflictError('Duplicate');
    const vanillaError = new Error('Plain error');

    expect(isBaseError(baseError)).toBe(true);
    expect(isBaseError(vanillaError)).toBe(false);
    expect(isOperationalError(baseError)).toBe(true);
    expect(isOperationalError(new InternalServerError())).toBe(false);

    expect(getErrorDetails(baseError)).toMatchObject({
      code: ErrorCodes.CONFLICT,
      message: 'Duplicate',
    });
    expect(getErrorDetails(vanillaError)).toMatchObject({
      name: 'Error',
      message: 'Plain error',
    });
    expect(getErrorDetails('string failure')).toMatchObject({
      message: 'string failure',
    });
  });
});
