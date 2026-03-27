import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { instanceManager } from './InstanceManager';
import { sendSuccess } from '../../core/http';
import { validateUuidParam } from '../../core/server/http/paramValidation';
import { ValidationError } from '../../core/errors';
import { asyncHandler } from '../../core/logging/errorHandler';

const router = Router();
router.param('id', validateUuidParam('id'));

const SessionCheckBodySchema = z.object({
  url: z.string().url(),
});

// POST /api/profiles/:id/start
router.post('/profiles/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const instance = await instanceManager.launchInstance(req.params['id'] as string);
  sendSuccess(res, instance, 201);
}));

// POST /api/profiles/:id/stop
router.post('/profiles/:id/stop', asyncHandler(async (req: Request, res: Response) => {
  await instanceManager.stopInstance(req.params['id'] as string);
  sendSuccess(res, null);
}));

// POST /api/profiles/:id/restart
router.post('/profiles/:id/restart', asyncHandler(async (req: Request, res: Response) => {
  const profileId = req.params['id'] as string;
  const status = instanceManager.getStatus(profileId);
  if (status !== 'not_running') {
    await instanceManager.stopInstance(profileId);
  }
  const instance = await instanceManager.launchInstance(profileId);
  sendSuccess(res, instance, 201);
}));

// GET /api/instances
router.get('/instances', (_req: Request, res: Response) => {
  sendSuccess(res, instanceManager.listInstances());
});

// POST /api/instances/stop-all
router.post('/instances/stop-all', asyncHandler(async (_req: Request, res: Response) => {
  await instanceManager.stopAll();
  sendSuccess(res, null);
}));

// POST /api/profiles/:id/session-check
router.post('/profiles/:id/session-check', asyncHandler(async (req: Request, res: Response) => {
  const parsed = SessionCheckBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      context: { issues: parsed.error.issues },
    });
  }
  const result = await instanceManager.sessionCheck(req.params['id'] as string, parsed.data.url);
  sendSuccess(res, result);
}));

// GET /api/profiles/:id/status
router.get('/profiles/:id/status', (req: Request, res: Response) => {
  const status = instanceManager.getStatus(req.params['id'] as string);
  sendSuccess(res, { status });
});

export default router;
