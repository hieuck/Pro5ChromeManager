/**
 * Base error class for application errors with stable HTTP metadata.
 */
export class BaseError extends Error {
  readonly name: string;
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: {
    code: string;
    statusCode?: number;
    isOperational?: boolean;
    correlationId?: string;
    context?: Record<string, unknown>;
  }) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.timestamp = new Date().toISOString();
    this.correlationId = options.correlationId;
    this.context = options.context;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      context: this.context,
      stack: this.stack,
    };
  }

  withContext(context: Record<string, unknown>): this {
    return new BaseError(this.message, {
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      correlationId: this.correlationId,
      context: { ...this.context, ...context },
    }) as this;
  }
}
