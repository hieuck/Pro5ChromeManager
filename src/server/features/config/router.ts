import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { configManager, AppConfigSchema, AppConfig } from './ConfigManager';
import { logger } from '../../core/logging/logger';
import { sendSuccess, sendError, getErrorStatusCode, getErrorMessage } from '../../core/http';

const router = Router();
const ConfigUpdateSchema = AppConfigSchema.deepPartial().strict();

router.get('/config', (_req: Request, res: Response) => {
  sendSuccess(res, configManager.get());
});

router.put('/config', async (req: Request, res: Response) => {
  const parsed = ConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(
      res,
      400,
      'Invalid config payload',
      'VALIDATION_ERROR',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
    return;
  }

  try {
    const updated = await configManager.update(parsed.data as Partial<AppConfig>);
    sendSuccess(res, updated);
  } catch (err) {
    const details = err instanceof z.ZodError
      ? err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      : undefined;
    logger.error('Failed to update config', { error: getErrorMessage(err) });
    if (details) {
      sendError(res, 400, 'Validation failed', 'VALIDATION_ERROR', details);
      return;
    }
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

export default router;
