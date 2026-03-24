import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { runtimeManager } from '../managers/RuntimeManager';

const router = Router();

const RuntimeBodySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  executablePath: z.string().min(1),
});

// GET /api/runtimes
router.get('/runtimes', async (_req: Request, res: Response) => {
  await runtimeManager.refreshAvailability();
  const runtimes = runtimeManager.listRuntimes().map((runtime) => ({
    ...runtime,
    name: runtime.label,
  }));
  res.json({ success: true, data: runtimes });
});

// POST /api/runtimes
router.post('/runtimes', async (req: Request, res: Response) => {
  const parsed = RuntimeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid runtime data', details: parsed.error.issues });
    return;
  }
  try {
    const runtime = await runtimeManager.upsertRuntime(
      parsed.data.key,
      parsed.data.label,
      parsed.data.executablePath,
    );
    res.status(201).json({ success: true, data: runtime });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// PUT /api/runtimes/:key
router.put('/runtimes/:key', async (req: Request, res: Response) => {
  const key = req.params['key'] as string;
  const parsed = RuntimeBodySchema.omit({ key: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid runtime data', details: parsed.error.issues });
    return;
  }
  try {
    const runtime = await runtimeManager.upsertRuntime(key, parsed.data.label, parsed.data.executablePath);
    res.json({ success: true, data: runtime });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/runtimes/:key
router.delete('/runtimes/:key', async (req: Request, res: Response) => {
  try {
    await runtimeManager.deleteRuntime(req.params['key'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

export default router;
