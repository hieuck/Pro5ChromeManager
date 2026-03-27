import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { runtimeManager } from './RuntimeManager';
import { sendSuccess, sendError, getErrorStatusCode, getErrorMessage } from '../../core/http';
import { asyncHandler } from '../../core/logging/errorHandler';

const router = Router();

const RuntimeBodySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  executablePath: z.string().min(1),
});

// GET /api/runtimes
router.get('/runtimes', asyncHandler(async (_req: Request, res: Response) => {
  await runtimeManager.refreshAvailability();
  const runtimes = runtimeManager.listRuntimes().map((runtime) => ({
    ...runtime,
    name: runtime.label,
  }));
  sendSuccess(res, runtimes);
}));

// POST /api/runtimes
router.post('/runtimes', async (req: Request, res: Response) => {
  const parsed = RuntimeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(
      res,
      400,
      'Invalid runtime data',
      'VALIDATION_ERROR',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
    return;
  }
  try {
    const runtime = await runtimeManager.upsertRuntime(
      parsed.data.key,
      parsed.data.label,
      parsed.data.executablePath,
    );
    sendSuccess(res, runtime, 201);
  } catch (err) {
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

// PUT /api/runtimes/:key
router.put('/runtimes/:key', async (req: Request, res: Response) => {
  const key = req.params['key'] as string;
  const parsed = RuntimeBodySchema.omit({ key: true }).safeParse(req.body);
  if (!parsed.success) {
    sendError(
      res,
      400,
      'Invalid runtime data',
      'VALIDATION_ERROR',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
    return;
  }
  try {
    const runtime = await runtimeManager.upsertRuntime(key, parsed.data.label, parsed.data.executablePath);
    sendSuccess(res, runtime);
  } catch (err) {
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

// DELETE /api/runtimes/:key
router.delete('/runtimes/:key', async (req: Request, res: Response) => {
  try {
    await runtimeManager.deleteRuntime(req.params['key'] as string);
    sendSuccess(res, null);
  } catch (err) {
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

export default router;
