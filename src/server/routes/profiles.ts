import { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { z } from 'zod';
import { profileManager } from '../managers/ProfileManager';
import { fingerprintEngine } from '../managers/FingerprintEngine';
import { licenseManager } from '../managers/LicenseManager';
import { logger } from '../utils/logger';

const router = Router();

// ─── Zod schemas ───────────────────────────────────────────────────────────────

const CreateProfileSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  proxy: z.unknown().optional(),
  fingerprint: z.unknown().optional(),
});

const SearchSchema = z.object({
  name: z.string().optional(),
  tags: z.string().optional(),   // comma-separated
  group: z.string().optional(),
  owner: z.string().optional(),
});

// ─── GET /api/profiles ─────────────────────────────────────────────────────────

router.get('/profiles', (req: Request, res: Response) => {
  try {
    const query = SearchSchema.parse(req.query);
    const profiles = profileManager.searchProfiles({
      name: query.name,
      tags: query.tags ? query.tags.split(',').map((t) => t.trim()) : undefined,
      group: query.group,
      owner: query.owner,
    });
    res.json({ success: true, data: profiles });
  } catch (err) {
    logger.error('GET /api/profiles error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── POST /api/profiles ────────────────────────────────────────────────────────

router.post('/profiles', async (req: Request, res: Response) => {
  try {
    const body = CreateProfileSchema.parse(req.body);

    // Enforce free tier limit
    const profilesUsed = profileManager.listProfiles().length;
    if (!licenseManager.canCreateProfile(profilesUsed)) {
      res.status(403).json({
        success: false,
        error: 'Đã đạt giới hạn 10 profiles của gói Free. Nâng cấp lên Pro để tạo không giới hạn.',
        code: 'FREE_TIER_LIMIT',
      });
      return;
    }

    const profile = await profileManager.createProfile(body.name, {
      notes: body.notes,
      tags: body.tags,
      group: body.group ?? null,
      owner: body.owner ?? null,
      runtime: body.runtime,
    });
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    logger.error('POST /api/profiles error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── POST /api/profiles/generate-fingerprint ─────────────────────────────────

router.post('/profiles/generate-fingerprint', (_req: Request, res: Response) => {
  try {
    const fp = fingerprintEngine.generateFingerprint();
    res.json({ success: true, data: fp });
  } catch (err) {
    logger.error('POST /api/profiles/generate-fingerprint error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to generate fingerprint' });
  }
});

// ─── POST /api/profiles/import ────────────────────────────────────────────────

router.post('/profiles/import', async (req: Request, res: Response) => {
  try {
    const { srcDir } = z.object({ srcDir: z.string().min(1) }).parse(req.body);

    const profilesUsed = profileManager.listProfiles().length;
    if (!licenseManager.canCreateProfile(profilesUsed)) {
      res.status(403).json({ success: false, error: 'Đã đạt giới hạn Free tier.', code: 'FREE_TIER_LIMIT' });
      return;
    }

    const profile = await profileManager.importProfile(srcDir);
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    logger.error('POST /api/profiles/import error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── POST /api/profiles/import-bulk ──────────────────────────────────────────

router.post('/profiles/import-bulk', async (req: Request, res: Response) => {
  try {
    const { srcDirs } = z.object({ srcDirs: z.array(z.string().min(1)).min(1) }).parse(req.body);
    const results: Array<{ srcDir: string; success: boolean; profile?: unknown; error?: string }> = [];

    for (const srcDir of srcDirs) {
      // Check limit before each import
      const profilesUsed = profileManager.listProfiles().length;
      if (!licenseManager.canCreateProfile(profilesUsed)) {
        results.push({ srcDir, success: false, error: 'Đã đạt giới hạn Free tier.' });
        continue;
      }
      try {
        const profile = await profileManager.importProfile(srcDir);
        results.push({ srcDir, success: true, profile });
      } catch (err) {
        results.push({ srcDir, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('POST /api/profiles/import-bulk error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── GET /api/profiles/:id ────────────────────────────────────────────────────

router.get('/profiles/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    logger.error('GET /api/profiles/:id error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── PUT /api/profiles/:id ────────────────────────────────────────────────────

router.put('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = UpdateProfileSchema.parse(req.body);
    const profile = await profileManager.updateProfile(id, body as Parameters<typeof profileManager.updateProfile>[1]);
    res.json({ success: true, data: profile });
  } catch (err) {
    logger.error('PUT /api/profiles/:id error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── DELETE /api/profiles/:id ─────────────────────────────────────────────────

router.delete('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await profileManager.deleteProfile(id);
    res.json({ success: true, data: null });
  } catch (err) {
    logger.error('DELETE /api/profiles/:id error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ─── GET /api/profiles/:id/export ────────────────────────────────────────────

router.get('/profiles/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const tmpPath = path.join(os.tmpdir(), `profile-${id}-${Date.now()}.zip`);
    await profileManager.exportProfile(id, tmpPath);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="profile-${id}.zip"`);
    res.sendFile(tmpPath, (err) => {
      if (err) {
        logger.error('Export sendFile error', { error: err.message });
      }
      // cleanup temp file
      fs.unlink(tmpPath).catch(() => undefined);
    });
  } catch (err) {
    logger.error('GET /api/profiles/:id/export error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ─── GET /api/profiles/:id/activity ──────────────────────────────────────────

router.get('/profiles/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    const activityPath = path.resolve('data/activity.log');
    const content = await fs.readFile(activityPath, 'utf-8').catch(() => '');
    const sessions = content
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } })
      .filter((entry): entry is Record<string, unknown> => entry !== null && entry['profileId'] === id)
      .slice(-50)
      .reverse();
    res.json({ success: true, data: sessions });
  } catch (err) {
    logger.error('GET /api/profiles/:id/activity error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
