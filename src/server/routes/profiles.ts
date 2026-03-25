import express, { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { z } from 'zod';
import { profileManager } from '../managers/ProfileManager';
import { fingerprintEngine } from '../managers/FingerprintEngine';
import { extensionManager } from '../managers/ExtensionManager';
import { cookieManager } from '../managers/CookieManager';
import { proxyManager } from '../managers/ProxyManager';
import { usageMetricsManager } from '../managers/UsageMetricsManager';
import { logger } from '../utils/logger';
import { dataPath } from '../utils/dataPaths';

const router = Router();

// ─── Zod schemas ───────────────────────────────────────────────────────────────

const CreateProfileSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  proxyId: z.string().nullable().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    folder: z.string().nullable().optional(),
  })).optional(),
});

const BulkCreateProfilesSchema = z.object({
  entries: z.array(z.object({
    name: z.string().min(1),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    group: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
  })).min(1),
  runtime: z.string().optional(),
  proxyId: z.string().nullable().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    folder: z.string().nullable().optional(),
  })).optional(),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  proxyId: z.string().nullable().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    folder: z.string().nullable().optional(),
  })).optional(),
  fingerprint: z.unknown().optional(),
});

const BulkUpdateProfilesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  updates: z.object({
    group: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    runtime: z.string().optional(),
    addTags: z.array(z.string()).optional(),
    removeTags: z.array(z.string()).optional(),
    setTags: z.array(z.string()).optional(),
  }).refine((value) => (
    value.group !== undefined
    || value.owner !== undefined
    || value.runtime !== undefined
    || value.addTags !== undefined
    || value.removeTags !== undefined
    || value.setTags !== undefined
  ), {
    message: 'At least one bulk update field is required',
  }).refine((value) => !(value.setTags && (value.addTags || value.removeTags)), {
    message: 'setTags cannot be combined with addTags or removeTags',
  }),
});

const SearchSchema = z.object({
  name: z.string().optional(),
  tags: z.string().optional(),   // comma-separated
  group: z.string().optional(),
  owner: z.string().optional(),
});

const CloneProfileSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    folder: z.string().nullable().optional(),
  })).optional(),
});

const CookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().min(1),
  path: z.string().optional(),
  expires: z.number().nullable().optional(),
  expirationDate: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.string().optional(),
});

const ImportCookiesSchema = z.object({
  cookies: z.array(CookieSchema).min(1),
});

function resolveProxySelection(proxyId?: string | null) {
  if (proxyId === undefined) {
    return undefined;
  }
  if (proxyId === null) {
    return null;
  }

  const proxy = proxyManager.getProxy(proxyId);
  if (!proxy) {
    throw new Error(`Proxy not found: ${proxyId}`);
  }
  return { ...proxy };
}

function buildProfileUpdateFields(
  body: z.infer<typeof UpdateProfileSchema>,
): Parameters<typeof profileManager.updateProfile>[1] {
  const resolvedExtensionIds = body.extensionIds !== undefined || body.extensionCategories !== undefined
    ? extensionManager.resolveExtensionSelection(body.extensionIds, body.extensionCategories)
    : undefined;

  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    ...(body.group !== undefined ? { group: body.group } : {}),
    ...(body.owner !== undefined ? { owner: body.owner } : {}),
    ...(body.runtime !== undefined ? { runtime: body.runtime } : {}),
    ...(body.bookmarks !== undefined ? { bookmarks: body.bookmarks.map((bookmark) => ({ ...bookmark, folder: bookmark.folder ?? null })) } : {}),
    ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
    ...(body.fingerprint !== undefined
      ? { fingerprint: body.fingerprint as Parameters<typeof profileManager.updateProfile>[1]['fingerprint'] }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'proxyId')
      ? { proxy: resolveProxySelection(body.proxyId) }
      : {}),
  };
}

function mergeProfileTags(
  currentTags: string[],
  updates: z.infer<typeof BulkUpdateProfilesSchema>['updates'],
): string[] {
  if (updates.setTags) {
    return Array.from(new Set(updates.setTags.map((tag) => tag.trim()).filter(Boolean)));
  }

  const nextTags = new Set(currentTags);
  for (const tag of updates.addTags ?? []) {
    const normalized = tag.trim();
    if (normalized) {
      nextTags.add(normalized);
    }
  }
  for (const tag of updates.removeTags ?? []) {
    nextTags.delete(tag.trim());
  }
  return Array.from(nextTags);
}

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
    const resolvedExtensionIds = body.extensionIds !== undefined || body.extensionCategories !== undefined
      ? extensionManager.resolveExtensionSelection(body.extensionIds, body.extensionCategories)
      : undefined;

    const profile = await profileManager.createProfile(body.name, {
      notes: body.notes,
      tags: body.tags,
      group: body.group ?? null,
      owner: body.owner ?? null,
      runtime: body.runtime,
      proxy: resolveProxySelection(body.proxyId) ?? null,
      ...(body.bookmarks !== undefined ? { bookmarks: body.bookmarks.map((bookmark) => ({ ...bookmark, folder: bookmark.folder ?? null })) } : {}),
      ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
    });
    await usageMetricsManager.recordProfileCreated();
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    logger.error('POST /api/profiles error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── POST /api/profiles/generate-fingerprint ─────────────────────────────────

router.post('/profiles/bulk-create', async (req: Request, res: Response) => {
  try {
    const body = BulkCreateProfilesSchema.parse(req.body);
    const resolvedExtensionIds = body.extensionIds !== undefined || body.extensionCategories !== undefined
      ? extensionManager.resolveExtensionSelection(body.extensionIds, body.extensionCategories)
      : undefined;
    const resolvedProxy = resolveProxySelection(body.proxyId) ?? null;
    const profiles = [];

    for (const entry of body.entries) {
      const profile = await profileManager.createProfile(entry.name, {
        notes: entry.notes,
        tags: entry.tags,
        group: entry.group ?? null,
        owner: entry.owner ?? null,
        runtime: body.runtime,
        proxy: resolvedProxy,
        ...(body.bookmarks !== undefined ? { bookmarks: body.bookmarks.map((bookmark) => ({ ...bookmark, folder: bookmark.folder ?? null })) } : {}),
        ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
      });
      await usageMetricsManager.recordProfileCreated();
      profiles.push(profile);
    }

    res.status(201).json({ success: true, data: { total: profiles.length, profiles } });
  } catch (err) {
    logger.error('POST /api/profiles/bulk-create error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

router.post('/profiles/bulk-update', async (req: Request, res: Response) => {
  try {
    const body = BulkUpdateProfilesSchema.parse(req.body);
    const profiles = body.ids.map((id) => {
      const profile = profileManager.getProfile(id);
      if (!profile) {
        throw new Error(`Profile not found: ${id}`);
      }
      return profile;
    });

    const updatedProfiles = [];
    for (const profile of profiles) {
      const nextFields: Parameters<typeof profileManager.updateProfile>[1] = {
        ...(body.updates.group !== undefined ? { group: body.updates.group } : {}),
        ...(body.updates.owner !== undefined ? { owner: body.updates.owner } : {}),
        ...(body.updates.runtime !== undefined ? { runtime: body.updates.runtime } : {}),
        ...(
          body.updates.setTags !== undefined
          || body.updates.addTags !== undefined
          || body.updates.removeTags !== undefined
            ? { tags: mergeProfileTags(profile.tags, body.updates) }
            : {}
        ),
      };

      updatedProfiles.push(await profileManager.updateProfile(profile.id, nextFields));
    }

    res.json({ success: true, data: { total: updatedProfiles.length, profiles: updatedProfiles } });
  } catch (err) {
    logger.error('POST /api/profiles/bulk-update error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

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

    const profile = await profileManager.importProfile(srcDir);
    await usageMetricsManager.recordProfileImported();
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    logger.error('POST /api/profiles/import error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── POST /api/profiles/import-bulk ──────────────────────────────────────────

router.post('/profiles/import-package', express.raw({ type: 'application/octet-stream', limit: '512mb' }), async (req: Request, res: Response) => {
  const uploadedPackagePath = path.join(
    dataPath('tmp'),
    `profile-package-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`,
  );

  try {
    const packageBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (packageBody.length === 0) {
      res.status(400).json({ success: false, error: 'Profile package payload is empty' });
      return;
    }

    await fs.mkdir(path.dirname(uploadedPackagePath), { recursive: true });
    await fs.writeFile(uploadedPackagePath, packageBody);

    const profile = await profileManager.importProfilePackage(uploadedPackagePath);
    await usageMetricsManager.recordProfileImported();
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    logger.error('POST /api/profiles/import-package error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  } finally {
    await fs.rm(uploadedPackagePath, { force: true }).catch(() => undefined);
  }
});

router.post('/profiles/import-bulk', async (req: Request, res: Response) => {
  try {
    const { srcDirs } = z.object({ srcDirs: z.array(z.string().min(1)).min(1) }).parse(req.body);
    const results: Array<{ srcDir: string; success: boolean; profile?: unknown; error?: string }> = [];

    for (const srcDir of srcDirs) {
      try {
        const profile = await profileManager.importProfile(srcDir);
        await usageMetricsManager.recordProfileImported();
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

router.get('/profiles/:id/cookies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const cookies = await cookieManager.listCookies(id);
    res.json({ success: true, data: { count: cookies.length, cookies } });
  } catch (err) {
    logger.error('GET /api/profiles/:id/cookies error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load cookies' });
  }
});

router.post('/profiles/:id/cookies/import', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const body = ImportCookiesSchema.parse(req.body);
    const cookies = await cookieManager.importCookies(id, body.cookies);
    res.status(201).json({ success: true, data: { count: cookies.length, cookies } });
  } catch (err) {
    logger.error('POST /api/profiles/:id/cookies/import error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

router.delete('/profiles/:id/cookies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    await cookieManager.clearCookies(id);
    res.json({ success: true, data: null });
  } catch (err) {
    logger.error('DELETE /api/profiles/:id/cookies error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to clear cookies' });
  }
});

router.get('/profiles/:id/cookies/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = profileManager.getProfile(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const cookies = await cookieManager.listCookies(id);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="profile-${safeId}-cookies.json"`);
    res.send(JSON.stringify(cookies, null, 2));
  } catch (err) {
    logger.error('GET /api/profiles/:id/cookies/export error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to export cookies' });
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
    const profile = await profileManager.updateProfile(id, buildProfileUpdateFields(body));
    res.json({ success: true, data: profile });
  } catch (err) {
    logger.error('PUT /api/profiles/:id error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

// ─── DELETE /api/profiles/:id ─────────────────────────────────────────────────

router.post('/profiles/:id/clone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = CloneProfileSchema.parse(req.body ?? {});
    const resolvedExtensionIds = body.extensionIds !== undefined || body.extensionCategories !== undefined
      ? extensionManager.resolveExtensionSelection(body.extensionIds, body.extensionCategories)
      : undefined;

    const profile = await profileManager.cloneProfile(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.group !== undefined ? { group: body.group } : {}),
      ...(body.owner !== undefined ? { owner: body.owner } : {}),
      ...(body.runtime !== undefined ? { runtime: body.runtime } : {}),
      ...(body.bookmarks !== undefined ? { bookmarks: body.bookmarks.map((bookmark) => ({ ...bookmark, folder: bookmark.folder ?? null })) } : {}),
      ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
    });
    await usageMetricsManager.recordProfileCreated();
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    logger.error('POST /api/profiles/:id/clone error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Bad request' });
  }
});

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

    // Sanitize the id before using it in a filesystem path or filename
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    const tmpPath = path.join(os.tmpdir(), `profile-${safeId}-${Date.now()}.zip`);
    await profileManager.exportProfile(id, tmpPath);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="profile-${safeId}.zip"`);
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
    const activityPath = dataPath('activity.log');
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
