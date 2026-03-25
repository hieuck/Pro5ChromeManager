import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProfileManager } from './ProfileManager';
import { migrateProfile } from './profile/Migration';
import { Profile } from '../shared/types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'pm-test-'));
}

async function makeManager(profilesDir: string, dataDir: string): Promise<ProfileManager> {
  const mgr = new ProfileManager(profilesDir, dataDir);
  await mgr.initialize();
  return mgr;
}

async function makeManagerWithDefaults(
  profilesDir: string,
  dataDir: string,
  extensionIds: string[],
): Promise<ProfileManager> {
  const mgr = new ProfileManager(profilesDir, dataDir, () => extensionIds);
  await mgr.initialize();
  return mgr;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('migrateProfile', () => {
  it('v0 → v1: adds missing fields', () => {
    const raw = { id: 'abc', name: 'Test' };
    const migrated = migrateProfile(raw, 1);
    expect(migrated['schemaVersion']).toBe(1);
    expect(migrated['notes']).toBe('');
    expect(migrated['tags']).toEqual([]);
    expect(migrated['group']).toBeNull();
    expect(migrated['owner']).toBeNull();
    expect(migrated['runtime']).toBe('auto');
    expect(migrated['proxy']).toBeNull();
    expect(migrated['extensionIds']).toEqual([]);
    expect(migrated['lastUsedAt']).toBeNull();
    expect(migrated['totalSessions']).toBe(0);
  });

  it('v1 profile is unchanged', () => {
    const raw = {
      id: 'abc',
      schemaVersion: 1,
      name: 'Test',
      notes: 'hello',
      tags: ['tag1'],
      group: 'grp',
      owner: 'alice',
      runtime: 'chrome',
      proxy: null,
      extensionIds: [],
      lastUsedAt: null,
      totalSessions: 5,
    };
    const migrated = migrateProfile(raw, 1);
    expect(migrated['schemaVersion']).toBe(1);
    expect(migrated['notes']).toBe('hello');
    expect(migrated['tags']).toEqual(['tag1']);
    expect(migrated['totalSessions']).toBe(5);
  });
});

describe('ProfileManager — P1: UUID uniqueness', () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    dataDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('creates profiles with unique IDs', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const N = 20;
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      const p = await mgr.createProfile(`Profile ${i}`);
      ids.push(p.id);
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(N);
  });
});

describe('ProfileManager — P2: metadata round-trip', () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    dataDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('write then read returns equivalent profile', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const created = await mgr.createProfile('Round-trip', {
      notes: 'some notes',
      tags: ['a', 'b'],
      group: 'grp1',
      owner: 'alice',
    });

    // Reload from disk
    const mgr2 = await makeManager(tmpDir, dataDir);
    const loaded = mgr2.getProfile(created.id);

    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(created.id);
    expect(loaded!.name).toBe('Round-trip');
    expect(loaded!.notes).toBe('some notes');
    expect(loaded!.tags).toEqual(['a', 'b']);
    expect(loaded!.group).toBe('grp1');
    expect(loaded!.owner).toBe('alice');
    expect(loaded!.schemaVersion).toBe(1);
    expect(loaded!.totalSessions).toBe(0);
    expect(loaded!.lastUsedAt).toBeNull();
  });

  it('updateProfile persists changes', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const p = await mgr.createProfile('Original');
    await mgr.updateProfile(p.id, { name: 'Updated', tags: ['x'] });

    const mgr2 = await makeManager(tmpDir, dataDir);
    const loaded = mgr2.getProfile(p.id);
    expect(loaded!.name).toBe('Updated');
    expect(loaded!.tags).toEqual(['x']);
  });
});

describe('ProfileManager — P6: isolation (unique userDataDir)', () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    dataDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('each profile has a unique directory', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const p1 = await mgr.createProfile('P1');
    const p2 = await mgr.createProfile('P2');
    const p3 = await mgr.createProfile('P3');

    const dirs = [p1.id, p2.id, p3.id].map((id) => path.join(tmpDir, id));
    const unique = new Set(dirs);
    expect(unique.size).toBe(3);

    // Each directory actually exists on disk
    for (const d of dirs) {
      const stat = await fs.stat(d);
      expect(stat.isDirectory()).toBe(true);
    }
  });
});

describe('ProfileManager — CRUD operations', () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    dataDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('listProfiles returns all created profiles', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await mgr.createProfile('A');
    await mgr.createProfile('B');
    await mgr.createProfile('C');
    expect(mgr.listProfiles()).toHaveLength(3);
  });

  it('deleteProfile removes from memory and disk', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const p = await mgr.createProfile('ToDelete');
    await mgr.deleteProfile(p.id);

    expect(mgr.getProfile(p.id)).toBeUndefined();
    await expect(fs.access(path.join(tmpDir, p.id))).rejects.toThrow();
  });

  it('searchProfiles filters by name', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await mgr.createProfile('Alice');
    await mgr.createProfile('Bob');
    await mgr.createProfile('Alice2');

    const results = mgr.searchProfiles({ name: 'alice' });
    expect(results).toHaveLength(2);
    expect(results.every((p) => p.name.toLowerCase().includes('alice'))).toBe(true);
  });

  it('searchProfiles filters by tag', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await mgr.createProfile('P1', { tags: ['social'] });
    await mgr.createProfile('P2', { tags: ['ecom'] });
    await mgr.createProfile('P3', { tags: ['social', 'ecom'] });

    const results = mgr.searchProfiles({ tags: ['social'] });
    expect(results).toHaveLength(2);
  });

  it('updateLastUsed increments totalSessions', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const p = await mgr.createProfile('Sessions');
    await mgr.updateLastUsed(p.id);
    await mgr.updateLastUsed(p.id);

    const updated = mgr.getProfile(p.id)!;
    expect(updated.totalSessions).toBe(2);
    expect(updated.lastUsedAt).not.toBeNull();
  });

  it('cloneProfile duplicates settings into a new profile with reset usage data', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const original = await mgr.createProfile('Source Profile', {
      notes: 'ready to duplicate',
      tags: ['warm', 'team-a'],
      group: 'sales',
      owner: 'alice',
      runtime: 'chrome',
    });
    await mgr.updateLastUsed(original.id);

    const clone = await mgr.cloneProfile(original.id);

    expect(clone.id).not.toBe(original.id);
    expect(clone.name).toBe('Source Profile Copy');
    expect(clone.notes).toBe(original.notes);
    expect(clone.tags).toEqual(original.tags);
    expect(clone.group).toBe(original.group);
    expect(clone.owner).toBe(original.owner);
    expect(clone.runtime).toBe(original.runtime);
    expect(clone.totalSessions).toBe(0);
    expect(clone.lastUsedAt).toBeNull();

    const originalDir = path.join(tmpDir, original.id);
    const cloneDir = path.join(tmpDir, clone.id);
    const originalProfile = JSON.parse(await fs.readFile(path.join(originalDir, 'profile.json'), 'utf-8')) as { id: string };
    const clonedProfile = JSON.parse(await fs.readFile(path.join(cloneDir, 'profile.json'), 'utf-8')) as { id: string };

    expect(originalProfile.id).toBe(original.id);
    expect(clonedProfile.id).toBe(clone.id);
  });

  it('cloneProfile accepts overrides for the new profile', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    const original = await mgr.createProfile('Override Me', {
      tags: ['baseline'],
      group: 'ops',
    });

    const clone = await mgr.cloneProfile(original.id, {
      name: 'Override Copy',
      tags: ['priority'],
      group: 'growth',
      owner: 'bob',
    });

    expect(clone.name).toBe('Override Copy');
    expect(clone.tags).toEqual(['priority']);
    expect(clone.group).toBe('growth');
    expect(clone.owner).toBe('bob');
    expect(clone.id).not.toBe(original.id);
  });

  it('throws when updating non-existent profile', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await expect(mgr.updateProfile('non-existent', { name: 'X' })).rejects.toThrow('not found');
  });

  it('throws when deleting non-existent profile', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await expect(mgr.deleteProfile('non-existent')).rejects.toThrow('not found');
  });

  it('auto-attaches default extensions to newly created profiles', async () => {
    const mgr = await makeManagerWithDefaults(tmpDir, dataDir, ['default-extension-id']);
    const profile = await mgr.createProfile('Auto Extension Profile');

    expect(profile.extensionIds).toEqual(['default-extension-id']);
  });

  it('imports an exported profile package with metadata and cookies restored', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    const mgr = await makeManager(tmpDir, dataDir);
    const original = await mgr.createProfile('Portable Profile', {
      notes: 'ready to move',
      tags: ['portable', 'ops'],
      group: 'ops',
      owner: 'alice',
      runtime: 'chrome',
      bookmarks: [
        { name: 'Example', url: 'https://example.com', folder: 'Warmup' },
      ],
    });

    const originalDir = path.join(tmpDir, original.id);
    await fs.writeFile(
      path.join(originalDir, 'cookies.json'),
      JSON.stringify([
        {
          name: 'session',
          value: 'abc123',
          domain: '.example.com',
          path: '/',
          expires: null,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ], null, 2),
      'utf-8',
    );

    const archivePath = path.join(dataDir, 'portable-profile.zip');
    await mgr.exportProfile(original.id, archivePath);

    const imported = await mgr.importProfilePackage(archivePath);
    const importedDir = path.join(tmpDir, imported.id);
    const importedCookies = JSON.parse(await fs.readFile(path.join(importedDir, 'cookies.json'), 'utf-8')) as Array<{ name: string; value: string }>;

    expect(imported.id).not.toBe(original.id);
    expect(imported.name).toBe('Portable Profile');
    expect(imported.notes).toBe('ready to move');
    expect(imported.tags).toEqual(['portable', 'ops']);
    expect(imported.group).toBe('ops');
    expect(imported.owner).toBe('alice');
    expect(imported.runtime).toBe('chrome');
    expect(imported.totalSessions).toBe(0);
    expect(imported.lastUsedAt).toBeNull();
    expect(imported.bookmarks).toEqual([
      { name: 'Example', url: 'https://example.com', folder: 'Warmup' },
    ]);
    expect(importedCookies[0]).toMatchObject({ name: 'session', value: 'abc123' });
  });
});

describe('ProfileManager — migration v0→v1 on load', () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    dataDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('loads v0 profile and migrates to v1', async () => {
    // Write a v0 profile (no schemaVersion)
    const id = 'test-v0-id';
    const profileDir = path.join(tmpDir, id);
    await fs.mkdir(profileDir, { recursive: true });

    const v0Profile = {
      id,
      name: 'Legacy Profile',
      // no schemaVersion, no lastUsedAt, no totalSessions, etc.
      fingerprint: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        platform: 'Win32',
        vendor: 'Google Inc.',
        language: 'en-US',
        languages: ['en-US'],
        hardwareConcurrency: 4,
        deviceMemory: 4,
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: 'Asia/Ho_Chi_Minh',
        canvas: { noise: 0.001, seed: 12345 },
        webgl: { renderer: 'ANGLE', vendor: 'Google Inc.', noise: 0.001 },
        audio: { noise: 0.0001 },
        fonts: ['Arial'],
        webrtcPolicy: 'default',
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    await fs.writeFile(
      path.join(profileDir, 'profile.json'),
      JSON.stringify(v0Profile),
      'utf-8'
    );

    const mgr = await makeManager(tmpDir, dataDir);
    const loaded = mgr.getProfile(id);

    expect(loaded).toBeDefined();
    expect(loaded!.schemaVersion).toBe(1);
    expect(loaded!.notes).toBe('');
    expect(loaded!.tags).toEqual([]);
    expect(loaded!.group).toBeNull();
    expect(loaded!.owner).toBeNull();
    expect(loaded!.extensionIds).toEqual([]);
    expect(loaded!.lastUsedAt).toBeNull();
    expect(loaded!.totalSessions).toBe(0);
    expect(loaded!.name).toBe('Legacy Profile');
  });
});
