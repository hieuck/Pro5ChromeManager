import type { NextFunction, Request, Response } from 'express';
import { validate as isUuid } from 'uuid';
import { sendError } from '../../http';

export function validateUuidParam(paramName = 'id') {
  return (request: Request, response: Response, next: NextFunction): void => {
    const value = request.params[paramName];

    if (!value || !isUuid(value)) {
      sendError(response, 400, `Invalid ${paramName} format. Must be a valid UUID.`);
      return;
    }

    next();
  };
}
