import { Response } from 'express';

export function sendSuccess<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data });
}

export function sendError(response: Response, status: number, error: string): void {
  response.status(status).json({ success: false, error });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('not found');
}
