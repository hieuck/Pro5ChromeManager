import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { instanceManager } from './InstanceManager';

const router = Router();

const SessionCheckBodySchema = z.object({
  url: z.string().url(),
});

// POST /api/profiles/:id/start
router.post('/profiles/:id/start', async (req: Request, res: Response) => {
  try {
    const instance = await instanceManager.launchInstance(req.params['id'] as string);
    res.status(201).json({ success: true, data: instance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// POST /api/profiles/:id/stop
router.post('/profiles/:id/stop', async (req: Request, res: Response) => {
  try {
    await instanceManager.stopInstance(req.params['id'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('No running instance') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// POST /api/profiles/:id/restart
router.post('/profiles/:id/restart', async (req: Request, res: Response) => {
  try {
    const profileId = req.params['id'] as string;
    const status = instanceManager.getStatus(profileId);
    if (status !== 'not_running') {
      await instanceManager.stopInstance(profileId);
    }
    const instance = await instanceManager.launchInstance(profileId);
    res.status(201).json({ success: true, data: instance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// GET /api/instances
router.get('/instances', (_req: Request, res: Response) => {
  res.json({ success: true, data: instanceManager.listInstances() });
});

// POST /api/instances/stop-all
router.post('/instances/stop-all', async (_req: Request, res: Response) => {
  try {
    await instanceManager.stopAll();
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/profiles/:id/session-check
router.post('/profiles/:id/session-check', async (req: Request, res: Response) => {
  const parsed = SessionCheckBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid request body', details: parsed.error.issues });
    return;
  }
  try {
    const result = await instanceManager.sessionCheck(req.params['id'] as string, parsed.data.url);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/profiles/:id/status
router.get('/profiles/:id/status', (req: Request, res: Response) => {
  const status = instanceManager.getStatus(req.params['id'] as string);
  res.json({ success: true, data: { status } });
});

export default router;
