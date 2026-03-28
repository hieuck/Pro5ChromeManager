export { BaseError } from './BaseError';
export {
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from './ClientErrors';
export {
  InternalServerError,
  ServiceUnavailableError,
  DatabaseError,
  FileSystemError,
  NetworkError,
  IntegrationError,
  ConfigurationError,
} from './ServerErrors';
export {
  getErrorDetails,
  isBaseError,
  isOperationalError,
} from './types';

export enum ErrorCodes {
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}
