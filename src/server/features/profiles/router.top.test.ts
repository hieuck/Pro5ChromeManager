import fs from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FIRST_PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_PROFILE_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createProfile: vi.fn(),
  generateFingerprint: vi.fn(),
  getProfile: vi.fn(),
  importProfile: vi.fn(),
  importProfilePackage: vi.fn(),
  loggerError: vi.fn(),
  recordProfileCreated: vi.fn(),
  recordProfileImported: vi.fn(),
  searchProfiles: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('./ProfileManager', () => ({
  profileManager: {
    createProfile: mocks.createProfile,
    getProfile: mocks.getProfile,
    importProfile: mocks.importProfile,
    importProfilePackage: mocks.importProfilePackage,
    searchProfiles: mocks.searchProfiles,
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
    clearCookies: vi.fn(),
    importCookies: vi.fn(),
    listCookies: vi.fn(),
  },
}));

vi.mock('../../core/telemetry/UsageMetricsManager', () => ({
  usageMetricsManager: {
    recordProfileCreated: mocks.recordProfileCreated,
    recordProfileImported: mocks.recordProfileImported,
  },
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('profiles router top-half flows', () => {
  let tempDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-profiles-router-top-'));
    previousDataDir = process.env['DATA_DIR'];
    process.env['DATA_DIR'] = tempDir;
    vi.resetModules();
    mocks.createProfile.mockReset();
    mocks.generateFingerprint.mockReset();
    mocks.getProfile.mockReset();
    mocks.importProfile.mockReset();
    mocks.importProfilePackage.mockReset();
    mocks.loggerError.mockReset();
    mocks.recordProfileCreated.mockReset();
    mocks.recordProfileImported.mockReset();
    mocks.searchProfiles.mockReset();
    mocks.updateProfile.mockReset();
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

  it('searches profiles with parsed query filters', async () => {
    mocks.searchProfiles.mockReturnValue([
      { id: FIRST_PROFILE_ID, name: 'Alpha', tags: ['team-a', 'owner-a'] },
    ]);

    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/profiles?name=Alpha&tags=team-a,owner-a&group=Growth&owner=Alice`,
      );
      const payload = await response.json() as { data: Array<{ id: string }>; success: boolean };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data[0]?.id).toBe(FIRST_PROFILE_ID);
      expect(mocks.searchProfiles).toHaveBeenCalledWith({
        name: 'Alpha',
        tags: ['team-a', 'owner-a'],
        group: 'Growth',
        owner: 'Alice',
      });
    });
  });

  it('creates a profile and records usage metrics', async () => {
    mocks.createProfile.mockResolvedValue({
      id: FIRST_PROFILE_ID,
      name: 'Alpha',
    });
    mocks.recordProfileCreated.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alpha',
          notes: 'Ready for launch',
          tags: ['team-a'],
          group: 'Growth',
          owner: 'Alice',
        }),
      });
      const payload = await response.json() as { data: { name: string }; success: boolean };

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(payload.data.name).toBe('Alpha');
      expect(mocks.createProfile).toHaveBeenCalledWith('Alpha', {
        notes: 'Ready for launch',
        tags: ['team-a'],
        group: 'Growth',
        owner: 'Alice',
        runtime: undefined,
        proxy: null,
      });
      expect(mocks.recordProfileCreated).toHaveBeenCalledOnce();
    });
  });

  it('bulk-creates profiles while preserving entry-specific overrides', async () => {
    mocks.createProfile
      .mockResolvedValueOnce({ id: FIRST_PROFILE_ID, name: 'Alpha' })
      .mockResolvedValueOnce({ id: SECOND_PROFILE_ID, name: 'Beta' });
    mocks.recordProfileCreated.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            { name: 'Alpha', notes: 'first', tags: ['team-a'] },
            { name: 'Beta', owner: 'Bob', group: 'Support' },
          ],
          runtime: 'chrome',
          group: 'Growth',
          owner: 'Alice',
        }),
      });
      const payload = await response.json() as { data: { profiles: unknown[]; total: number }; success: boolean };

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(payload.data.total).toBe(2);
      expect(payload.data.profiles).toHaveLength(2);
      expect(mocks.createProfile).toHaveBeenNthCalledWith(1, 'Alpha', {
        notes: 'first',
        tags: ['team-a'],
        group: null,
        owner: null,
        runtime: 'chrome',
        proxy: null,
      });
      expect(mocks.createProfile).toHaveBeenNthCalledWith(2, 'Beta', {
        notes: undefined,
        tags: undefined,
        group: 'Support',
        owner: 'Bob',
        runtime: 'chrome',
        proxy: null,
      });
      expect(mocks.recordProfileCreated).toHaveBeenCalledTimes(2);
    });
  });

  it('bulk-updates all requested profiles and merges tags through the helper logic', async () => {
    mocks.getProfile.mockImplementation((id: string) => {
      if (id === FIRST_PROFILE_ID) {
        return { id, tags: ['existing', 'shared'] };
      }
      if (id === SECOND_PROFILE_ID) {
        return { id, tags: ['existing'] };
      }
      return undefined;
    });
    mocks.updateProfile
      .mockResolvedValueOnce({ id: FIRST_PROFILE_ID, tags: ['shared', 'new-tag'] })
      .mockResolvedValueOnce({ id: SECOND_PROFILE_ID, tags: ['new-tag'] });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [FIRST_PROFILE_ID, SECOND_PROFILE_ID],
          updates: {
            group: 'Ops',
            addTags: ['new-tag'],
            removeTags: ['existing'],
          },
        }),
      });
      const payload = await response.json() as { data: { profiles: unknown[]; total: number }; success: boolean };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.total).toBe(2);
      expect(mocks.updateProfile).toHaveBeenNthCalledWith(1, FIRST_PROFILE_ID, {
        group: 'Ops',
        tags: ['shared', 'new-tag'],
      });
      expect(mocks.updateProfile).toHaveBeenNthCalledWith(2, SECOND_PROFILE_ID, {
        group: 'Ops',
        tags: ['new-tag'],
      });
    });
  });

  it('returns a generated fingerprint and surfaces generator failures', async () => {
    mocks.generateFingerprint
      .mockReturnValueOnce({ userAgent: 'Mozilla/5.0', platform: 'Win32' })
      .mockImplementationOnce(() => {
        throw new Error('fingerprint engine unavailable');
      });

    await withServer(async (baseUrl) => {
      const successResponse = await fetch(`${baseUrl}/api/profiles/generate-fingerprint`, {
        method: 'POST',
      });
      const successPayload = await successResponse.json() as { data: { platform: string }; success: boolean };

      expect(successResponse.status).toBe(200);
      expect(successPayload.success).toBe(true);
      expect(successPayload.data.platform).toBe('Win32');

      const failureResponse = await fetch(`${baseUrl}/api/profiles/generate-fingerprint`, {
        method: 'POST',
      });
      const failurePayload = await failureResponse.json() as { error: string; success: boolean };

      expect(failureResponse.status).toBe(500);
      expect(failurePayload.success).toBe(false);
      expect(failurePayload.error).toBe('Failed to generate fingerprint');
      expect(mocks.loggerError).toHaveBeenCalledWith('POST /api/profiles/generate-fingerprint error', {
        error: 'fingerprint engine unavailable',
      });
    });
  });

  it('imports profiles from directories and package uploads and records usage metrics', async () => {
    mocks.importProfile.mockResolvedValue({ id: FIRST_PROFILE_ID, name: 'Imported Dir' });
    mocks.importProfilePackage.mockResolvedValue({ id: SECOND_PROFILE_ID, name: 'Imported Package' });
    mocks.recordProfileImported.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const importResponse = await fetch(`${baseUrl}/api/profiles/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcDir: 'E:/tmp/profile-dir',
        }),
      });
      const importPayload = await importResponse.json() as { data: { name: string }; success: boolean };

      expect(importResponse.status).toBe(201);
      expect(importPayload.success).toBe(true);
      expect(importPayload.data.name).toBe('Imported Dir');

      const packageResponse = await fetch(`${baseUrl}/api/profiles/import-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from('zip-bytes'),
      });
      const packagePayload = await packageResponse.json() as { data: { name: string }; success: boolean };

      expect(packageResponse.status).toBe(201);
      expect(packagePayload.success).toBe(true);
      expect(packagePayload.data.name).toBe('Imported Package');
      expect(mocks.importProfilePackage).toHaveBeenCalledWith(expect.stringContaining('profile-package-'));
      expect(mocks.recordProfileImported).toHaveBeenCalledTimes(2);
    });
  });

  it('rejects empty profile package uploads before invoking the manager', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/import-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.alloc(0),
      });
      const payload = await response.json() as { error: string; success: boolean };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Profile package payload is empty');
      expect(mocks.importProfilePackage).not.toHaveBeenCalled();
    });
  });

  it('bulk-imports profile directories and reports per-entry failures without aborting the batch', async () => {
    mocks.importProfile.mockImplementation(async (srcDir: string) => {
      if (srcDir === 'E:/profiles/missing') {
        throw new Error('missing profile');
      }
      return { id: FIRST_PROFILE_ID, name: path.basename(srcDir) };
    });
    mocks.recordProfileImported.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/import-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcDirs: ['E:/profiles/alpha', 'E:/profiles/missing'],
        }),
      });
      const payload = await response.json() as {
        data: Array<{ error?: string; srcDir: string; success: boolean }>;
        success: boolean;
      };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([
        {
          srcDir: 'E:/profiles/alpha',
          success: true,
          profile: {
            id: FIRST_PROFILE_ID,
            name: 'alpha',
          },
        },
        {
          srcDir: 'E:/profiles/missing',
          success: false,
          error: 'Internal server error',
        },
      ]);
      expect(mocks.recordProfileImported).toHaveBeenCalledOnce();
    });
  });
});
