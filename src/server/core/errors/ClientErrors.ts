import { BaseError } from './BaseError';

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(`${resource} not found: ${identifier}`, {
      code: 'NOT_FOUND',
      statusCode: 404,
      correlationId: options.correlationId,
      context: {
        resource,
        identifier,
        ...options.context,
      },
    });
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, options: {
    field?: string;
    value?: unknown;
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      correlationId: options.correlationId,
      context: {
        field: options.field,
        value: options.value,
        ...options.context,
      },
    });
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = 'Unauthorized access', options: {
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(message, {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      correlationId: options.correlationId,
      context: options.context,
    });
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = 'Access forbidden', options: {
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(message, {
      code: 'FORBIDDEN',
      statusCode: 403,
      correlationId: options.correlationId,
      context: options.context,
    });
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(message, {
      code: 'CONFLICT',
      statusCode: 409,
      correlationId: options.correlationId,
      context: options.context,
    });
  }
}

export class RateLimitError extends BaseError {
  constructor(message = 'Rate limit exceeded', options: {
    limit?: number;
    window?: number;
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(message, {
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      correlationId: options.correlationId,
      context: {
        limit: options.limit,
        window: options.window,
        ...options.context,
      },
    });
  }
}
