import { BaseError } from './BaseError';

export class InternalServerError extends BaseError {
  constructor(message = 'Internal server error', options: {
    correlationId?: string;
    context?: Record<string, unknown>;
    originalError?: Error;
  } = {}) {
    super(message, {
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      isOperational: false,
      correlationId: options.correlationId,
      context: {
        originalError: options.originalError?.message,
        ...options.context,
      },
    });
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(service: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
    retryAfter?: number;
  } = {}) {
    super(`${service} is unavailable`, {
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      correlationId: options.correlationId,
      context: {
        service,
        retryAfter: options.retryAfter,
        ...options.context,
      },
    });
  }
}

export class DatabaseError extends BaseError {
  constructor(operation: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
    originalError?: Error;
  } = {}) {
    super(`Database operation failed: ${operation}`, {
      code: 'DATABASE_ERROR',
      statusCode: 500,
      isOperational: false,
      correlationId: options.correlationId,
      context: {
        operation,
        originalError: options.originalError?.message,
        ...options.context,
      },
    });
  }
}

export class FileSystemError extends BaseError {
  constructor(operation: string, targetPath: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
    originalError?: Error;
  } = {}) {
    super(`File system operation failed: ${operation} on ${targetPath}`, {
      code: 'FILE_SYSTEM_ERROR',
      statusCode: 500,
      isOperational: false,
      correlationId: options.correlationId,
      context: {
        operation,
        path: targetPath,
        originalError: options.originalError?.message,
        ...options.context,
      },
    });
  }
}

export class NetworkError extends BaseError {
  constructor(operation: string, target: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
    originalError?: Error;
  } = {}) {
    super(`Network operation failed: ${operation} to ${target}`, {
      code: 'NETWORK_ERROR',
      statusCode: 500,
      isOperational: false,
      correlationId: options.correlationId,
      context: {
        operation,
        target,
        originalError: options.originalError?.message,
        ...options.context,
      },
    });
  }
}

export class IntegrationError extends BaseError {
  constructor(service: string, operation: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
    originalError?: Error;
  } = {}) {
    super(`Integration failed: ${service} - ${operation}`, {
      code: 'INTEGRATION_ERROR',
      statusCode: 500,
      isOperational: false,
      correlationId: options.correlationId,
      context: {
        service,
        operation,
        originalError: options.originalError?.message,
        ...options.context,
      },
    });
  }
}

export class ConfigurationError extends BaseError {
  constructor(setting: string, options: {
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {}) {
    super(`Invalid configuration: ${setting}`, {
      code: 'CONFIGURATION_ERROR',
      statusCode: 500,
      isOperational: false,
      correlationId: options.correlationId,
      context: {
        setting,
        ...options.context,
      },
    });
  }
}
