import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  sendError: vi.fn(),
}));

vi.mock('../http', async () => {
  const actual = await vi.importActual<typeof import('../http')>('../http');
  return {
    ...actual,
    sendError: mocks.sendError,
  };
});

vi.mock('./LoggerService', () => ({
  loggerService: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));

describe('errorHandlerMiddleware', () => {
  let previousDebugContext: string | undefined;
  let previousNodeEnv: string | undefined;
  let previousErrorReporter: string | undefined;
  let previousReportingEnabled: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    mocks.loggerError.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.sendError.mockReset();
    previousDebugContext = process.env['PRO5_DEBUG_ERROR_CONTEXT'];
    previousNodeEnv = process.env['NODE_ENV'];
    previousErrorReporter = process.env['PRO5_ERROR_REPORTER'];
    previousReportingEnabled = process.env['PRO5_ENABLE_ERROR_REPORTING'];
    delete process.env['PRO5_DEBUG_ERROR_CONTEXT'];
    delete process.env['PRO5_ERROR_REPORTER'];
    delete process.env['PRO5_ENABLE_ERROR_REPORTING'];
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    if (previousDebugContext === undefined) {
      delete process.env['PRO5_DEBUG_ERROR_CONTEXT'];
    } else {
      process.env['PRO5_DEBUG_ERROR_CONTEXT'] = previousDebugContext;
    }

    if (previousNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = previousNodeEnv;
    }

    if (previousErrorReporter === undefined) {
      delete process.env['PRO5_ERROR_REPORTER'];
    } else {
      process.env['PRO5_ERROR_REPORTER'] = previousErrorReporter;
    }

    if (previousReportingEnabled === undefined) {
      delete process.env['PRO5_ENABLE_ERROR_REPORTING'];
    } else {
      process.env['PRO5_ENABLE_ERROR_REPORTING'] = previousReportingEnabled;
    }
  });

  function createRequestResponse() {
    const request = {
      correlationId: 'corr-123',
      method: 'POST',
      path: '/api/profiles',
      url: '/api/profiles',
    };
    const response = {
      headersSent: false,
      locals: {} as Record<string, unknown>,
    };
    return { request, response };
  }

  it('delegates immediately when headers have already been sent', async () => {
    const { errorHandlerMiddleware } = await import('./errorHandler');
    const { request, response } = createRequestResponse();
    const next = vi.fn();
    const error = new Error('stream closed');
    response.headersSent = true;

    errorHandlerMiddleware(error, request as never, response as never, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(mocks.sendError).not.toHaveBeenCalled();
  });

  it('sends operational BaseError responses with debug context when enabled', async () => {
    process.env['PRO5_DEBUG_ERROR_CONTEXT'] = 'true';

    const { ValidationError } = await import('../errors');
    const { errorHandlerMiddleware } = await import('./errorHandler');
    const { request, response } = createRequestResponse();
    const next = vi.fn();
    const error = new ValidationError('Invalid config payload', {
      field: 'api.port',
      value: 70000,
    });

    errorHandlerMiddleware(error, request as never, response as never, next);

    expect(mocks.sendError).toHaveBeenCalledWith(
      response,
      400,
      'Invalid config payload',
      'VALIDATION_ERROR',
      expect.objectContaining({
        field: 'api.port',
        value: 70000,
      }),
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith('Operational error', {
      correlationId: 'corr-123',
      error: 'Invalid config payload',
    });
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('maps payload-too-large errors without leaking context', async () => {
    const { errorHandlerMiddleware } = await import('./errorHandler');
    const { request, response } = createRequestResponse();
    const next = vi.fn();
    const error = Object.assign(new Error('entity too large'), { statusCode: 413 });

    errorHandlerMiddleware(error, request as never, response as never, next);

    expect(mocks.sendError).toHaveBeenCalledWith(
      response,
      413,
      'Payload too large',
      'PAYLOAD_TOO_LARGE',
      undefined,
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Programmer error - requires immediate attention',
      error,
      {
        correlationId: 'corr-123',
        stack: error.stack,
      },
    );
  });

  it('logs unexpected errors and attempts error reporting in production mode', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['PRO5_ENABLE_ERROR_REPORTING'] = 'true';
    process.env['PRO5_ERROR_REPORTER'] = 'sentry';

    const { errorHandlerMiddleware } = await import('./errorHandler');
    const { request, response } = createRequestResponse();
    const next = vi.fn();
    const error = new Error('database offline');

    errorHandlerMiddleware(error, request as never, response as never, next);

    expect(mocks.sendError).toHaveBeenCalledWith(
      response,
      500,
      'Internal server error',
      'INTERNAL_SERVER_ERROR',
      undefined,
    );
    expect(mocks.loggerError).toHaveBeenNthCalledWith(1, 'Unexpected error occurred', error, {
      correlationId: 'corr-123',
      method: 'POST',
      path: '/api/profiles',
    });
    expect(mocks.loggerError).toHaveBeenNthCalledWith(2, 'Programmer error - requires immediate attention', error, {
      correlationId: 'corr-123',
      stack: error.stack,
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith('Error reporting provider is not configured', {
      correlationId: 'corr-123',
      method: 'POST',
      path: '/api/profiles',
      error: 'database offline',
      provider: 'sentry',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('notFoundHandler and asyncHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.loggerError.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.sendError.mockReset();
  });

  it('creates a NOT_FOUND BaseError for unknown routes', async () => {
    const { BaseError, ErrorCodes } = await import('../errors');
    const { notFoundHandler } = await import('./errorHandler');
    const next = vi.fn();

    notFoundHandler({
      correlationId: 'corr-404',
      method: 'GET',
      url: '/missing',
    } as never, {} as never, next);

    const forwardedError = next.mock.calls[0]?.[0];
    expect(forwardedError).toBeInstanceOf(BaseError);
    expect(forwardedError).toMatchObject({
      code: ErrorCodes.NOT_FOUND,
      statusCode: 404,
      message: 'Route not found: GET /missing',
      correlationId: 'corr-404',
    });
  });

  it('wraps async handlers and forwards rejected promises to next', async () => {
    const { asyncHandler } = await import('./errorHandler');
    const next = vi.fn();
    const error = new Error('async failure');
    const wrapped = asyncHandler(async () => {
      throw error;
    });

    wrapped({} as never, {} as never, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not call next when the wrapped async handler resolves successfully', async () => {
    const { asyncHandler } = await import('./errorHandler');
    const next = vi.fn();
    const wrapped = asyncHandler(async () => undefined);

    wrapped({} as never, {} as never, next);
    await Promise.resolve();

    expect(next).not.toHaveBeenCalled();
  });
});
