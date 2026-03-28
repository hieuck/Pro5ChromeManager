import { randomUUID } from 'crypto';
import type winston from 'winston';
import { getErrorDetails } from '../errors';
import { logger } from './logger';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export class LoggerService {
  private defaultContext: LogContext = {};

  constructor(private readonly instance: winston.Logger) {}

  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  clearDefaultContext(): void {
    this.defaultContext = {};
  }

  generateCorrelationId(): string {
    return randomUUID();
  }

  error(message: string, error?: unknown, context: LogContext = {}): void {
    this.instance.error(message, {
      ...this.defaultContext,
      ...context,
      error: error ? getErrorDetails(error) : undefined,
    });
  }

  warn(message: string, context: LogContext = {}): void {
    this.instance.warn(message, { ...this.defaultContext, ...context });
  }

  info(message: string, context: LogContext = {}): void {
    this.instance.info(message, { ...this.defaultContext, ...context });
  }

  http(message: string, context: LogContext = {}): void {
    this.instance.http(message, { ...this.defaultContext, ...context });
  }

  verbose(message: string, context: LogContext = {}): void {
    this.instance.verbose(message, { ...this.defaultContext, ...context });
  }

  debug(message: string, context: LogContext = {}): void {
    this.instance.debug(message, { ...this.defaultContext, ...context });
  }

  silly(message: string, context: LogContext = {}): void {
    this.instance.silly(message, { ...this.defaultContext, ...context });
  }

  security(message: string, context: LogContext = {}): void {
    this.instance.warn(`SECURITY: ${message}`, {
      ...this.defaultContext,
      ...context,
      security: true,
    });
  }

  audit(message: string, context: LogContext = {}): void {
    this.instance.info(`AUDIT: ${message}`, {
      ...this.defaultContext,
      ...context,
      audit: true,
    });
  }

  performance(message: string, duration: number, context: LogContext = {}): void {
    this.instance.info(`PERFORMANCE: ${message}`, {
      ...this.defaultContext,
      ...context,
      duration,
      performance: true,
    });
  }

  child(context: LogContext): LoggerService {
    const childLogger = new LoggerService(this.instance);
    childLogger.setDefaultContext({ ...this.defaultContext, ...context });
    return childLogger;
  }

  logUncaughtException(error: Error, context: LogContext = {}): void {
    this.instance.error('Uncaught Exception', {
      ...this.defaultContext,
      ...context,
      uncaught: true,
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      error: getErrorDetails(error),
    });
  }

  logUnhandledRejection(reason: unknown, promise: Promise<unknown>, context: LogContext = {}): void {
    this.instance.error('Unhandled Promise Rejection', {
      ...this.defaultContext,
      ...context,
      unhandled: true,
      reason: getErrorDetails(reason),
      promise: promise.toString(),
    });
  }
}

export const loggerService = new LoggerService(logger);
