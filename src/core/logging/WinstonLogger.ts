import winston from 'winston';
import { Logger } from '../di/Container';

export class WinstonLogger implements Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'pro5-chrome-manager' },
      transports: [
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      ]
    });

    // Add console transport in development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    const errorMeta = error ? { 
      error: { 
        message: error.message, 
        stack: error.stack 
      } 
    } : {};
    
    this.logger.error(message, { ...meta, ...errorMeta });
  }

  // Child logger with additional context
  child(meta: Record<string, any>): Logger {
    return new ChildLogger(this.logger.child(meta));
  }
}

class ChildLogger implements Logger {
  constructor(private logger: winston.Logger) {}

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    const errorMeta = error ? { 
      error: { 
        message: error.message, 
        stack: error.stack 
      } 
    } : {};
    
    this.logger.error(message, { ...meta, ...errorMeta });
  }

  child(meta: Record<string, any>): Logger {
    return new ChildLogger(this.logger.child(meta));
  }
}

// Structured logging helper
export class StructuredLogger {
  constructor(private logger: Logger) {}

  profileAction(profileId: string, action: string, details?: Record<string, any>): void {
    this.logger.info(`Profile ${action}`, {
      profileId,
      action,
      ...details
    });
  }

  instanceEvent(instanceId: string, event: string, details?: Record<string, any>): void {
    this.logger.info(`Instance ${event}`, {
      instanceId,
      event,
      ...details
    });
  }

  systemEvent(event: string, details?: Record<string, any>): void {
    this.logger.info(`System ${event}`, {
      systemEvent: event,
      ...details
    });
  }
}