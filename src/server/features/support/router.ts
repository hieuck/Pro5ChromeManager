import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import { z } from 'zod';
import { logger } from '../../core/logging/logger';
import {
  buildIncidentSnapshot,
  loadIncidentEntries,
} from './supportDiagnostics';
import { buildSupportSelfTest, buildSupportStatus } from './supportStatus';
import { createDiagnosticsArchive } from './supportDiagnosticsExport';
import { sendSuccess, sendError, getErrorStatusCode, getErrorMessage } from '../../core/http';

const router = Router();

const SupportFeedbackSchema = z.object({
  category: z.enum(['bug', 'feedback', 'question']),
  sentiment: z.enum(['negative', 'neutral', 'positive']),
  message: z.string().trim().min(10).max(5000),
  email: z.string().email().optional().or(z.literal('')).optional(),
  appVersion: z.string().max(64).optional().or(z.literal('')).optional(),
});

const OnboardingStateSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'profile_created', 'completed', 'skipped']).optional(),
  currentStep: z.number().int().min(0).max(10).optional(),
  selectedRuntime: z.string().max(128).nullable().optional(),
  draftProfileName: z.string().max(256).nullable().optional(),
  createdProfileId: z.string().max(128).nullable().optional(),
  lastOpenedAt: z.string().datetime().nullable().optional(),
  profileCreatedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  skippedAt: z.string().datetime().nullable().optional(),
});

router.get('/support/status', async (_req: Request, res: Response) => {
  try {
    const status = await buildSupportStatus();
    sendSuccess(res, status);
  } catch (err) {
    logger.error('GET /api/support/status error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.get('/support/incidents', async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const incidents = buildIncidentSnapshot(await loadIncidentEntries(limit));
    sendSuccess(res, incidents);
  } catch (err) {
    logger.error('GET /api/support/incidents error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.post('/support/self-test', async (_req: Request, res: Response) => {
  try {
    const selfTest = await buildSupportSelfTest();
    sendSuccess(res, selfTest);
  } catch (err) {
    logger.error('POST /api/support/self-test error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.post('/support/onboarding-state', async (req: Request, res: Response) => {
  const parsed = OnboardingStateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'Invalid onboarding state payload');
    return;
  }

  try {
    const { onboardingStateManager } = await import('./OnboardingStateManager');
    const state = await onboardingStateManager.update(parsed.data);
    sendSuccess(res, state);
  } catch (err) {
    logger.error('POST /api/support/onboarding-state error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.get('/support/feedback', async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const { supportInboxManager } = await import('./SupportInboxManager');
    const entries = await supportInboxManager.listFeedback(limit);
    sendSuccess(res, { count: entries.length, entries });
  } catch (err) {
    logger.error('GET /api/support/feedback error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.post('/support/feedback', async (req: Request, res: Response) => {
  const parsed = SupportFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'Invalid feedback payload');
    return;
  }

  try {
    const { supportInboxManager } = await import('./SupportInboxManager');
    const entry = await supportInboxManager.createFeedback({
      category: parsed.data.category,
      sentiment: parsed.data.sentiment,
      message: parsed.data.message,
      email: parsed.data.email ?? null,
      appVersion: parsed.data.appVersion ?? null,
    });
    sendSuccess(res, entry, 201);
  } catch (err) {
    logger.error('POST /api/support/feedback error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

router.get('/support/diagnostics', async (_req: Request, res: Response) => {
  let tmpZipPath: string | null = null;

  try {
    tmpZipPath = await createDiagnosticsArchive();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="pro5-diagnostics.zip"');
    const archivePath = tmpZipPath;
    res.sendFile(archivePath, (err) => {
      if (err) {
        logger.error('GET /api/support/diagnostics sendFile error', { error: err.message });
      }
      void fs.unlink(archivePath).catch(() => undefined);
    });
  } catch (err) {
    logger.error('GET /api/support/diagnostics error', { error: getErrorMessage(err) });
    if (tmpZipPath) {
      void fs.unlink(tmpZipPath).catch(() => undefined);
    }
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

export default router;
