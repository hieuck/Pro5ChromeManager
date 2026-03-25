import { Router, Request, Response } from 'express';
import { configManager } from '../managers/ConfigManager';
import { logger } from '../utils/logger';

const router = Router();

router.get('/config', (_req: Request, res: Response) => {
  res.json({ success: true, data: configManager.get() });
});

router.put('/config', async (req: Request, res: Response) => {
  try {
    const updated = await configManager.update(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Failed to update config', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Invalid config' });
  }
});

export default router;
