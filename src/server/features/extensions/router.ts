import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { extensionManager } from './ExtensionManager';
import { logger } from '../../core/logging/logger';
import { sendSuccess, sendError, getErrorStatusCode, getErrorMessage } from '../../core/http';

const router = Router();

const CreateExtensionSchema = z.object({
  sourcePath: z.string().min(1),
  name: z.string().optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  defaultForNewProfiles: z.boolean().optional(),
});

const UpdateExtensionSchema = z.object({
  name: z.string().optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  defaultForNewProfiles: z.boolean().optional(),
});

router.get('/extensions', (_req: Request, res: Response) => {
  try {
    sendSuccess(res, extensionManager.listExtensions());
  } catch (err) {
    logger.error('GET /api/extensions error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.get('/extensions/bundles', (_req: Request, res: Response) => {
  try {
    sendSuccess(res, extensionManager.listBundles());
  } catch (err) {
    logger.error('GET /api/extensions/bundles error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.post('/extensions', async (req: Request, res: Response) => {
  try {
    const body = CreateExtensionSchema.parse(req.body);
    const extension = await extensionManager.addExtension(body);
    sendSuccess(res, extension, 201);
  } catch (err) {
    logger.error('POST /api/extensions error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.put('/extensions/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateExtensionSchema.parse(req.body);
    const extension = await extensionManager.updateExtension(req.params['id'] ?? '', body);
    sendSuccess(res, extension);
  } catch (err) {
    logger.error('PUT /api/extensions/:id error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.delete('/extensions/:id', async (req: Request, res: Response) => {
  try {
    await extensionManager.deleteExtension(req.params['id'] ?? '');
    sendSuccess(res, null);
  } catch (err) {
    logger.error('DELETE /api/extensions/:id error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

export default router;
