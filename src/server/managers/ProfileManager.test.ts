import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProfileManager, migrateProfile } from './ProfileManager';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'pm-test-'));
}

async function makeManager(profilesDir: string, dataDir: string): Promise<ProfileManager> {
  const mgr = new ProfileManager(profilesDir, dataDir);
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

  it('throws when updating non-existent profile', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await expect(mgr.updateProfile('non-existent', { name: 'X' })).rejects.toThrow('not found');
  });

  it('throws when deleting non-existent profile', async () => {
    const mgr = await makeManager(tmpDir, dataDir);
    await expect(mgr.deleteProfile('non-existent')).rejects.toThrow('not found');
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
    expect(loaded!.lastUsedAt).toBeNull();
    expect(loaded!.totalSessions).toBe(0);
    expect(loaded!.name).toBe('Legacy Profile');
  });
});
