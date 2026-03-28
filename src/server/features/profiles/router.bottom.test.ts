import fs from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  clearCookies: vi.fn(),
  cloneProfile: vi.fn(),
  deleteProfile: vi.fn(),
  exportProfile: vi.fn(),
  generateFingerprint: vi.fn(),
  getProfile: vi.fn(),
  importCookies: vi.fn(),
  listCookies: vi.fn(),
  loggerError: vi.fn(),
  recordProfileCreated: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('./ProfileManager', () => ({
  profileManager: {
    cloneProfile: mocks.cloneProfile,
    deleteProfile: mocks.deleteProfile,
    exportProfile: mocks.exportProfile,
    getProfile: mocks.getProfile,
    updateProfile: mocks.updateProfile,
  },
}));

vi.mock('./FingerprintEngine', () => ({
  fingerprintEngine: {
    generateFingerprint: mocks.generateFingerprint,
  },
}));

vi.mock('./CookieManager', () => ({
  cookieManager: {
    clearCookies: mocks.clearCookies,
    importCookies: mocks.importCookies,
    listCookies: mocks.listCookies,
  },
}));

vi.mock('../../core/telemetry/UsageMetricsManager', () => ({
  usageMetricsManager: {
    recordProfileCreated: mocks.recordProfileCreated,
  },
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('profiles router bottom-half flows', () => {
  let tempDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-profiles-router-'));
    previousDataDir = process.env['DATA_DIR'];
    process.env['DATA_DIR'] = tempDir;
    vi.resetModules();
    mocks.clearCookies.mockReset();
    mocks.cloneProfile.mockReset();
    mocks.deleteProfile.mockReset();
    mocks.exportProfile.mockReset();
    mocks.generateFingerprint.mockReset();
    mocks.getProfile.mockReset();
    mocks.importCookies.mockReset();
    mocks.listCookies.mockReset();
    mocks.loggerError.mockReset();
    mocks.recordProfileCreated.mockReset();
    mocks.updateProfile.mockReset();

    mocks.getProfile.mockReturnValue({
      id: PROFILE_ID,
      name: 'Primary Profile',
      tags: ['tag-a'],
    });
  });

  afterEach(async () => {
    if (previousDataDir === undefined) {
      delete process.env['DATA_DIR'];
    } else {
      process.env['DATA_DIR'] = previousDataDir;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function withServer(testFn: (baseUrl: string) => Promise<void>): Promise<void> {
    const { default: router } = await import('./router');
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', router);
    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind profiles router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('imports cookies for an existing profile', async () => {
    mocks.importCookies.mockResolvedValue([
      { name: 'session', value: 'cookie-1', domain: '.example.com' },
    ]);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/cookies/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies: [{ name: 'session', value: 'cookie-1', domain: '.example.com' }],
        }),
      });
      const payload = await response.json() as { success: boolean; data: { count: number } };

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(payload.data.count).toBe(1);
      expect(mocks.importCookies).toHaveBeenCalledWith(PROFILE_ID, [
        { name: 'session', value: 'cookie-1', domain: '.example.com' },
      ]);
    });
  });

  it('returns 404 when importing cookies into a missing profile', async () => {
    mocks.getProfile.mockReturnValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/cookies/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies: [{ name: 'session', value: 'cookie-1', domain: '.example.com' }],
        }),
      });
      const payload = await response.json() as { success: boolean; error: string };

      expect(response.status).toBe(404);
      expect(payload.success).toBe(false);
      expect(payload.error).toContain('Profile not found');
      expect(mocks.loggerError).toHaveBeenCalledWith('POST /api/profiles/:id/cookies/import error', {
        error: expect.stringContaining('Profile not found'),
      });
    });
  });

  it('clears cookies and exports them as a downloadable JSON file', async () => {
    mocks.listCookies.mockResolvedValue([
      { name: 'session', value: 'cookie-1', domain: '.example.com' },
      { name: 'refresh', value: 'cookie-2', domain: '.example.com' },
    ]);
    mocks.clearCookies.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const deleteResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/cookies`, {
        method: 'DELETE',
      });
      const deletePayload = await deleteResponse.json() as { success: boolean; data: null };

      expect(deleteResponse.status).toBe(200);
      expect(deletePayload).toEqual({ success: true, data: null });
      expect(mocks.clearCookies).toHaveBeenCalledWith(PROFILE_ID);

      const exportResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/cookies/export`);
      const exportPayload = await exportResponse.text();

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.headers.get('content-type')).toContain('application/json');
      expect(exportResponse.headers.get('content-disposition')).toBe(
        `attachment; filename="profile-${PROFILE_ID}-cookies.json"`,
      );
      expect(JSON.parse(exportPayload)).toEqual([
        { name: 'session', value: 'cookie-1', domain: '.example.com' },
        { name: 'refresh', value: 'cookie-2', domain: '.example.com' },
      ]);
    });
  });

  it('returns a single profile and updates it with validated input', async () => {
    mocks.updateProfile.mockResolvedValue({
      id: PROFILE_ID,
      name: 'Renamed Profile',
      tags: ['tag-a'],
    });

    await withServer(async (baseUrl) => {
      const getResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}`);
      const getPayload = await getResponse.json() as { success: boolean; data: { id: string } };

      expect(getResponse.status).toBe(200);
      expect(getPayload.data.id).toBe(PROFILE_ID);

      const updateResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed Profile' }),
      });
      const updatePayload = await updateResponse.json() as { success: boolean; data: { name: string } };

      expect(updateResponse.status).toBe(200);
      expect(updatePayload.data.name).toBe('Renamed Profile');
      expect(mocks.updateProfile).toHaveBeenCalledWith(PROFILE_ID, { name: 'Renamed Profile' });
    });
  });

  it('returns structured validation errors when updating a profile with invalid data', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: [{ name: '', url: 'invalid-url' }] }),
      });
      const payload = await response.json() as { success: boolean; error: string };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Validation failed');
      expect(mocks.loggerError).toHaveBeenCalledWith('PUT /api/profiles/:id error', { error: 'Validation failed' });
    });
  });

  it('clones and deletes profiles through the API', async () => {
    mocks.cloneProfile.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Clone',
    });
    mocks.deleteProfile.mockResolvedValue(undefined);
    mocks.recordProfileCreated.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const cloneResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Clone' }),
      });
      const clonePayload = await cloneResponse.json() as { success: boolean; data: { name: string } };

      expect(cloneResponse.status).toBe(201);
      expect(clonePayload.data.name).toBe('Clone');
      expect(mocks.cloneProfile).toHaveBeenCalledWith(PROFILE_ID, { name: 'Clone' });
      expect(mocks.recordProfileCreated).toHaveBeenCalledOnce();

      const deleteResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}`, {
        method: 'DELETE',
      });

      expect(deleteResponse.status).toBe(200);
      expect(mocks.deleteProfile).toHaveBeenCalledWith(PROFILE_ID);
    });
  });

  it('exports a profile package and removes the temporary archive afterwards', async () => {
    let exportedArchivePath = '';
    mocks.exportProfile.mockImplementation(async (_profileId: string, outputPath: string) => {
      exportedArchivePath = outputPath;
      await fs.writeFile(outputPath, 'zip-binary', 'utf-8');
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/export`);
      const payload = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/zip');
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="profile-${PROFILE_ID}.zip"`,
      );
      expect(payload).toBe('zip-binary');
    });

    expect(exportedArchivePath).toBeTruthy();
    await vi.waitFor(async () => {
      expect(await fs.access(exportedArchivePath).then(() => true).catch(() => false)).toBe(false);
    });
  });

  it('returns recent activity for the requested profile only, newest first, capped at fifty entries', async () => {
    const activityEntries = Array.from({ length: 55 }, (_value, index) => JSON.stringify({
      profileId: PROFILE_ID,
      sequence: index,
    }));
    const mixedContent = [
      JSON.stringify({ profileId: 'other-profile', sequence: -1 }),
      'not-json',
      ...activityEntries,
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'activity.log'), mixedContent, 'utf-8');

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/activity`);
      const payload = await response.json() as { success: boolean; data: Array<{ sequence: number }> };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data).toHaveLength(50);
      expect(payload.data[0]?.sequence).toBe(54);
      expect(payload.data[49]?.sequence).toBe(5);
    });
  });
});
