import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { LicenseManager } from './LicenseManager';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'license-test-'));
}

const MACHINE_ID = 'test-machine-id';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('LicenseManager — free tier', () => {
  let tmpDir: string;
  let manager: LicenseManager;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    manager = new LicenseManager(MACHINE_ID, path.join(tmpDir, 'license.dat'));
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns free tier when no license.dat exists', () => {
    const status = manager.getStatus(0);
    expect(status.tier).toBe('free');
  });

  it('free tier allows up to 10 profiles', () => {
    expect(manager.canCreateProfile(9)).toBe(true);
    expect(manager.canCreateProfile(10)).toBe(false);
  });

  it('free tier status includes profilesUsed and profilesLimit', () => {
    const status = manager.getStatus(5);
    expect(status).toMatchObject({ tier: 'free', profilesUsed: 5, profilesLimit: 10 });
  });
});

describe('LicenseManager — activate', () => {
  let tmpDir: string;
  let manager: LicenseManager;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    manager = new LicenseManager(MACHINE_ID, path.join(tmpDir, 'license.dat'));
    await manager.initialize();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('activates successfully when API returns valid=true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ valid: true, instance: { id: 'inst-123' } }),
    }));

    const status = await manager.activate('TEST-KEY-1234');
    expect(status.tier).toBe('pro');
    vi.unstubAllGlobals();
  });

  it('throws when API returns valid=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ valid: false }),
    }));

    await expect(manager.activate('BAD-KEY')).rejects.toThrow('không hợp lệ');
    vi.unstubAllGlobals();
  });

  it('throws when API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    await expect(manager.activate('ANY-KEY')).rejects.toThrow('kết nối');
    vi.unstubAllGlobals();
  });

  it('persists license.dat after activation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ valid: true, instance: { id: 'inst-abc' } }),
    }));

    await manager.activate('PERSIST-KEY');
    const licenseFile = path.join(tmpDir, 'license.dat');
    const exists = await fs.access(licenseFile).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('LicenseManager — deactivate', () => {
  let tmpDir: string;
  let manager: LicenseManager;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    manager = new LicenseManager(MACHINE_ID, path.join(tmpDir, 'license.dat'));
    await manager.initialize();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns free tier after deactivation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ valid: true, instance: { id: 'inst-x' } }),
    }));
    await manager.activate('DEACT-KEY');
    vi.unstubAllGlobals();

    await manager.deactivate();
    expect(manager.getStatus(0).tier).toBe('free');
  });
});

describe('LicenseManager — grace period', () => {
  let tmpDir: string;

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns grace tier when machineId changed', async () => {
    tmpDir = await makeTmpDir();
    const licenseFile = path.join(tmpDir, 'license.dat');

    // Activate on machine A
    const managerA = new LicenseManager('machine-A', licenseFile);
    await managerA.initialize();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ valid: true, instance: { id: 'inst-a' } }),
    }));
    await managerA.activate('GRACE-KEY');
    vi.unstubAllGlobals();

    // Load on machine B
    const managerB = new LicenseManager('machine-B', licenseFile);
    await managerB.initialize();
    const status = managerB.getStatus(0);
    expect(status.tier).toBe('grace');
    if (status.tier === 'grace') {
      expect(status.reason).toBe('machine_changed');
    }
  });
});

describe('LicenseManager — offline key', () => {
  let tmpDir: string;
  let manager: LicenseManager;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    manager = new LicenseManager(MACHINE_ID, path.join(tmpDir, 'license.dat'));
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates and activates a universal offline key (no network)', async () => {
    const key = LicenseManager.generateOfflineKey(null, null);
    expect(key.startsWith('PRO5-OFFLINE-')).toBe(true);

    const status = await manager.activate(key);
    expect(status.tier).toBe('pro');
  });

  it('activates machine-locked offline key when machineId matches', async () => {
    const key = LicenseManager.generateOfflineKey(MACHINE_ID, null);
    const status = await manager.activate(key);
    expect(status.tier).toBe('pro');
  });

  it('rejects machine-locked offline key for wrong machine', async () => {
    const key = LicenseManager.generateOfflineKey('other-machine', null);
    await expect(manager.activate(key)).rejects.toThrow('máy khác');
  });

  it('rejects expired offline key', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const key = LicenseManager.generateOfflineKey(null, past);
    await expect(manager.activate(key)).rejects.toThrow('hết hạn');
  });

  it('rejects tampered offline key', async () => {
    const key = LicenseManager.generateOfflineKey(null, null);
    const tampered = key.slice(0, -4) + 'XXXX';
    await expect(manager.activate(tampered)).rejects.toThrow('không hợp lệ');
  });

  it('offline key does not require re-validation (getStatus stays pro)', async () => {
    const key = LicenseManager.generateOfflineKey(null, null);
    await manager.activate(key);
    // Simulate 60 days passed — online key would enter grace period
    const status = manager.getStatus(0);
    expect(status.tier).toBe('pro');
  });

  it('persists offline key to license.dat', async () => {
    const key = LicenseManager.generateOfflineKey(null, null);
    await manager.activate(key);
    const licenseFile = path.join(tmpDir, 'license.dat');
    const exists = await fs.access(licenseFile).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
