import express, { Request, Response, Router } from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { profileManager } from './ProfileManager';
import { fingerprintEngine } from './FingerprintEngine';
import { cookieManager } from './CookieManager';
import { usageMetricsManager } from '../../core/telemetry/UsageMetricsManager';
import { logger } from '../../core/logging/logger';
import { dataPath } from '../../core/fs/dataPaths';
import { sendError, sendSuccess, getErrorStatusCode, getErrorMessage } from '../../core/http';
import { validateUuidParam } from '../../core/server/http/paramValidation';
import { NotFoundError } from '../../core/errors';
import {
  BulkCreateProfilesSchema,
  BulkImportProfilesSchema,
  BulkUpdateProfilesSchema,
  CloneProfileSchema,
  CreateProfileSchema,
  ImportCookiesSchema,
  ImportProfileSchema,
  SearchSchema,
  UpdateProfileSchema,
} from './contracts';
import {
  buildCloneProfileFields,
  buildCreateProfileFields,
  buildProfileUpdateFields,
  mergeProfileTags,
} from './helpers';

const router = Router();
router.param('id', validateUuidParam('id'));
const ACTIVITY_TAIL_READ_BYTES = 5 * 1024 * 1024;

function getRequiredProfile(profileId: string) {
  const profile = profileManager.getProfile(profileId);
  if (!profile) {
    throw new NotFoundError('Profile', profileId);
  }
  return profile;
}

async function readRecentActivityContent(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size <= 0) {
    return '';
  }

  if (stat.size <= ACTIVITY_TAIL_READ_BYTES) {
    return fs.readFile(filePath, 'utf-8').catch(() => '');
  }

  const file = await fs.open(filePath, 'r');
  try {
    const start = Math.max(0, stat.size - ACTIVITY_TAIL_READ_BYTES);
    const buffer = Buffer.alloc(stat.size - start);
    await file.read(buffer, 0, buffer.length, start);
    const text = buffer.toString('utf-8');

    // Trim partial first line when tail-reading.
    const firstBreak = text.indexOf('\n');
    if (firstBreak === -1) {
      return '';
    }
    return text.slice(firstBreak + 1);
  } finally {
    await file.close().catch(() => undefined);
  }
}

router.get('/profiles', (request: Request, response: Response) => {
  try {
    const query = SearchSchema.parse(request.query);
    const profiles = profileManager.searchProfiles({
      name: query.name,
      tags: query.tags ? query.tags.split(',').map((tag) => tag.trim()) : undefined,
      group: query.group,
      owner: query.owner,
    });

    sendSuccess(response, profiles);
  } catch (error) {
    logger.error('GET /api/profiles error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/profiles', async (request: Request, response: Response) => {
  try {
    const body = CreateProfileSchema.parse(request.body);
    const profile = await profileManager.createProfile(body.name, buildCreateProfileFields(body));

    await usageMetricsManager.recordProfileCreated();
    sendSuccess(response, profile, 201);
  } catch (error) {
    logger.error('POST /api/profiles error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/profiles/bulk-create', async (request: Request, response: Response) => {
  try {
    const body = BulkCreateProfilesSchema.parse(request.body);
    const sharedFields = buildCreateProfileFields(body);
    const profiles = [];

    for (const entry of body.entries) {
      const profile = await profileManager.createProfile(entry.name, {
        ...sharedFields,
        notes: entry.notes,
        tags: entry.tags,
        group: entry.group ?? sharedFields.group ?? null,
        owner: entry.owner ?? sharedFields.owner ?? null,
      });
      await usageMetricsManager.recordProfileCreated();
      profiles.push(profile);
    }

    sendSuccess(response, { total: profiles.length, profiles }, 201);
  } catch (error) {
    logger.error('POST /api/profiles/bulk-create error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/profiles/bulk-update', async (request: Request, response: Response) => {
  try {
    const body = BulkUpdateProfilesSchema.parse(request.body);
    const profiles = body.ids.map((id) => getRequiredProfile(id));
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

    sendSuccess(response, { total: updatedProfiles.length, profiles: updatedProfiles });
  } catch (error) {
    logger.error('POST /api/profiles/bulk-update error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/profiles/generate-fingerprint', (_request: Request, response: Response) => {
  try {
    const fingerprint = fingerprintEngine.generateFingerprint();
    sendSuccess(response, fingerprint);
  } catch (error) {
    logger.error('POST /api/profiles/generate-fingerprint error', { error: error instanceof Error ? error.message : String(error) });
    sendError(response, 500, 'Failed to generate fingerprint');
  }
});

router.post('/profiles/import', async (request: Request, response: Response) => {
  try {
    const body = ImportProfileSchema.parse(request.body);
    const profile = await profileManager.importProfile(body.srcDir);

    await usageMetricsManager.recordProfileImported();
    sendSuccess(response, profile, 201);
  } catch (error) {
    logger.error('POST /api/profiles/import error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post(
  '/profiles/import-package',
  express.raw({ type: 'application/octet-stream', limit: '512mb' }),
  async (request: Request, response: Response) => {
    const uploadedPackagePath = path.join(
      dataPath('tmp'),
      `profile-package-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`,
    );

    try {
      const packageBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      if (packageBody.length === 0) {
        sendError(response, 400, 'Profile package payload is empty');
        return;
      }

      await fs.mkdir(path.dirname(uploadedPackagePath), { recursive: true });
      await fs.writeFile(uploadedPackagePath, packageBody);

      const profile = await profileManager.importProfilePackage(uploadedPackagePath);
      await usageMetricsManager.recordProfileImported();
      sendSuccess(response, profile, 201);
    } catch (error) {
      logger.error('POST /api/profiles/import-package error', { error: getErrorMessage(error) });
      sendError(response, getErrorStatusCode(error), getErrorMessage(error));
    } finally {
      await fs.rm(uploadedPackagePath, { force: true }).catch(() => undefined);
    }
  },
);

router.post('/profiles/import-bulk', async (request: Request, response: Response) => {
  try {
    const body = BulkImportProfilesSchema.parse(request.body);
    const results: Array<{ srcDir: string; success: boolean; profile?: unknown; error?: string }> = [];

    for (const srcDir of body.srcDirs) {
      try {
        const profile = await profileManager.importProfile(srcDir);
        await usageMetricsManager.recordProfileImported();
        results.push({ srcDir, success: true, profile });
      } catch (error) {
        results.push({ srcDir, success: false, error: getErrorMessage(error) });
      }
    }

    sendSuccess(response, results);
  } catch (error) {
    logger.error('POST /api/profiles/import-bulk error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.get('/profiles/:id/cookies', async (request: Request, response: Response) => {
  try {
    const { id } = request.params;
    getRequiredProfile(id);

    const cookies = await cookieManager.listCookies(id);
    sendSuccess(response, { count: cookies.length, cookies });
  } catch (error) {
    logger.error('GET /api/profiles/:id/cookies error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/profiles/:id/cookies/import', async (request: Request, response: Response) => {
  try {
    const { id } = request.params;
    getRequiredProfile(id);

    const body = ImportCookiesSchema.parse(request.body);
    const cookies = await cookieManager.importCookies(id, body.cookies);
    sendSuccess(response, { count: cookies.length, cookies }, 201);
  } catch (error) {
    logger.error('POST /api/profiles/:id/cookies/import error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.delete('/profiles/:id/cookies', async (request: Request, response: Response) => {
  try {
    const { id } = request.params;
    getRequiredProfile(id);

    await cookieManager.clearCookies(id);
    sendSuccess(response, null);
  } catch (error) {
    logger.error('DELETE /api/profiles/:id/cookies error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.get('/profiles/:id/cookies/export', async (request: Request, response: Response) => {
  try {
    const { id } = request.params;
    getRequiredProfile(id);

    const cookies = await cookieManager.listCookies(id);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="profile-${safeId}-cookies.json"`);
    response.send(JSON.stringify(cookies, null, 2));
  } catch (error) {
    logger.error('GET /api/profiles/:id/cookies/export error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.get('/profiles/:id', (request: Request, response: Response) => {
  try {
    const profile = getRequiredProfile(request.params.id);
    sendSuccess(response, profile);
  } catch (error) {
    logger.error('GET /api/profiles/:id error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.put('/profiles/:id', async (request: Request, response: Response) => {
  try {
    const body = UpdateProfileSchema.parse(request.body);
    const profile = await profileManager.updateProfile(request.params.id, buildProfileUpdateFields(body));
    sendSuccess(response, profile);
  } catch (error) {
    logger.error('PUT /api/profiles/:id error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/profiles/:id/clone', async (request: Request, response: Response) => {
  try {
    const body = CloneProfileSchema.parse(request.body ?? {});
    const profile = await profileManager.cloneProfile(request.params.id, buildCloneProfileFields(body));

    await usageMetricsManager.recordProfileCreated();
    sendSuccess(response, profile, 201);
  } catch (error) {
    logger.error('POST /api/profiles/:id/clone error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.delete('/profiles/:id', async (request: Request, response: Response) => {
  try {
    await profileManager.deleteProfile(request.params.id);
    sendSuccess(response, null);
  } catch (error) {
    logger.error('DELETE /api/profiles/:id error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.get('/profiles/:id/export', async (request: Request, response: Response) => {
  try {
    const { id } = request.params;
    getRequiredProfile(id);

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    const temporaryPath = path.join(os.tmpdir(), `profile-${safeId}-${Date.now()}.zip`);
    await profileManager.exportProfile(id, temporaryPath);

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="profile-${safeId}.zip"`);
    response.sendFile(temporaryPath, (error) => {
      if (error) {
        logger.error('Export sendFile error', { error: error.message });
      }
      void fs.unlink(temporaryPath).catch(() => undefined);
    });
  } catch (error) {
    logger.error('GET /api/profiles/:id/export error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.get('/profiles/:id/activity', async (request: Request, response: Response) => {
  try {
    const { id } = request.params;
    getRequiredProfile(id);

    const activityPath = dataPath('activity.log');
    const content = await readRecentActivityContent(activityPath);
    const sessions = content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null && entry.profileId === id)
      .slice(-50)
      .reverse();

    sendSuccess(response, sessions);
  } catch (error) {
    logger.error('GET /api/profiles/:id/activity error', { error: getErrorMessage(error) });
    sendError(response, getErrorStatusCode(error), getErrorMessage(error));
  }
});

export default router;
