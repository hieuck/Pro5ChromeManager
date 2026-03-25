import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { extensionManager } from '../managers/ExtensionManager';
import { logger } from '../utils/logger';

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
    res.json({ success: true, data: extensionManager.listExtensions() });
  } catch (err) {
    logger.error('GET /api/extensions error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to list extensions' });
  }
});

router.get('/extensions/bundles', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: extensionManager.listBundles() });
  } catch (err) {
    logger.error('GET /api/extensions/bundles error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to list extension bundles' });
  }
});

router.post('/extensions', async (req: Request, res: Response) => {
  try {
    const body = CreateExtensionSchema.parse(req.body);
    const extension = await extensionManager.addExtension(body);
    res.status(201).json({ success: true, data: extension });
  } catch (err) {
    logger.error('POST /api/extensions error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

router.put('/extensions/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateExtensionSchema.parse(req.body);
    const extension = await extensionManager.updateExtension(req.params['id'] ?? '', body);
    res.json({ success: true, data: extension });
  } catch (err) {
    logger.error('PUT /api/extensions/:id error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

router.delete('/extensions/:id', async (req: Request, res: Response) => {
  try {
    await extensionManager.deleteExtension(req.params['id'] ?? '');
    res.json({ success: true, data: null });
  } catch (err) {
    logger.error('DELETE /api/extensions/:id error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

export default router;
