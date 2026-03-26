import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { z } from 'zod';
import { logger } from '../../core/logging/logger';
import { dataPath } from '../../core/fs/dataPaths';
import {
  appendIfExists,
  buildIncidentSnapshot,
  loadIncidentEntries,
  sanitizeJsonText,
} from './supportDiagnostics';
import { buildSupportSelfTest, buildSupportStatus } from './supportStatus';

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
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    logger.error('GET /api/support/status error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load support status' });
  }
});

router.get('/support/incidents', async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const incidents = buildIncidentSnapshot(await loadIncidentEntries(limit));
    res.json({
      success: true,
      data: incidents,
    });
  } catch (err) {
    logger.error('GET /api/support/incidents error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load incidents' });
  }
});

router.post('/support/self-test', async (_req: Request, res: Response) => {
  try {
    const selfTest = await buildSupportSelfTest();
    res.json({
      success: true,
      data: selfTest,
    });
  } catch (err) {
    logger.error('POST /api/support/self-test error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to run self-test' });
  }
});

router.post('/support/onboarding-state', async (req: Request, res: Response) => {
  const parsed = OnboardingStateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid onboarding state payload', details: parsed.error.issues });
    return;
  }

  try {
  const { onboardingStateManager } = await import('./OnboardingStateManager');
    const state = await onboardingStateManager.update(parsed.data);
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error('POST /api/support/onboarding-state error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to save onboarding state' });
  }
});

router.get('/support/feedback', async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const { supportInboxManager } = await import('./SupportInboxManager');
    const entries = await supportInboxManager.listFeedback(limit);
    res.json({
      success: true,
      data: {
        count: entries.length,
        entries,
      },
    });
  } catch (err) {
    logger.error('GET /api/support/feedback error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load support feedback' });
  }
});

router.post('/support/feedback', async (req: Request, res: Response) => {
  const parsed = SupportFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid feedback payload', details: parsed.error.issues });
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
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    logger.error('POST /api/support/feedback error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to save support feedback' });
  }
});

router.get('/support/diagnostics', async (_req: Request, res: Response) => {
  const tmpZipPath = path.join(os.tmpdir(), `pro5-diagnostics-${Date.now()}.zip`);

  try {
    const supportStatus = await buildSupportStatus();
    const selfTest = await buildSupportSelfTest();
    const incidents = buildIncidentSnapshot(await loadIncidentEntries(50));

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(tmpZipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      const summary = {
        generatedAt: new Date().toISOString(),
        appVersion: process.env['npm_package_version'] ?? '1.0.0',
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        dataDir: dataPath(),
      };
      archive.append(JSON.stringify(summary, null, 2), { name: 'summary.json' });
      archive.append(JSON.stringify(supportStatus, null, 2), { name: 'support-status.json' });
      archive.append(JSON.stringify(selfTest, null, 2), { name: 'self-test.json' });
      archive.append(JSON.stringify(incidents, null, 2), { name: 'incidents.json' });
      archive.append(JSON.stringify(incidents.summary, null, 2), { name: 'incident-summary.json' });
      archive.append(JSON.stringify(incidents.timeline, null, 2), { name: 'incident-timeline.json' });

      void Promise.all([
        appendIfExists(archive, dataPath('config.json'), 'config.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('instances.json'), 'instances.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('proxies.json'), 'proxies.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('activity.log'), 'activity.log'),
        appendIfExists(archive, dataPath('onboarding-state.json'), 'onboarding-state.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('support-feedback.json'), 'support-feedback.json', sanitizeJsonText),
      ]).then(async () => {
        try {
          const logFiles = await fs.readdir(dataPath('logs'));
          for (const file of logFiles.filter((entry) => entry.endsWith('.log'))) {
            archive.file(dataPath('logs', file), { name: path.posix.join('logs', file) });
          }
        } catch {
          // ignore missing logs
        }

        void archive.finalize();
      }).catch(reject);
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="pro5-diagnostics.zip"');
    res.sendFile(tmpZipPath, (err) => {
      if (err) {
        logger.error('GET /api/support/diagnostics sendFile error', { error: err.message });
      }
      void fs.unlink(tmpZipPath).catch(() => undefined);
    });
  } catch (err) {
    logger.error('GET /api/support/diagnostics error', { error: err instanceof Error ? err.message : String(err) });
    void fs.unlink(tmpZipPath).catch(() => undefined);
    res.status(500).json({ success: false, error: 'Failed to export diagnostics' });
  }
});

export default router;
