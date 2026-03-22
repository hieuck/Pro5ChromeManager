import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  FingerprintEngine,
  FingerprintDB,
  detectOsFromUA,
  extractPlatformFromUA,
} from './FingerprintEngine';

const VALID_HARDWARE_CONCURRENCY = [1, 2, 4, 6, 8, 10, 12, 16, 24, 32];
const VALID_DEVICE_MEMORY = [0.25, 0.5, 1, 2, 4, 8];

// ─── P3: Fingerprint Consistency ──────────────────────────────────────────────

describe('FingerprintEngine — P3: consistency', () => {
  let engine: FingerprintEngine;

  beforeEach(async () => {
    engine = new FingerprintEngine();
    await engine.initialize();
  });

  it('userAgent platform matches platform field', () => {
    for (let i = 0; i < 50; i++) {
      const fp = engine.generateFingerprint();
      const expectedPlatform = extractPlatformFromUA(fp.userAgent);
      expect(fp.platform).toBe(expectedPlatform);
    }
  });

  it('hardwareConcurrency is in valid set', () => {
    for (let i = 0; i < 50; i++) {
      const fp = engine.generateFingerprint();
      expect(VALID_HARDWARE_CONCURRENCY).toContain(fp.hardwareConcurrency);
    }
  });

  it('deviceMemory is in valid set', () => {
    for (let i = 0; i < 50; i++) {
      const fp = engine.generateFingerprint();
      expect(VALID_DEVICE_MEMORY).toContain(fp.deviceMemory);
    }
  });

  it('resolution is from valid list', () => {
    const validResolutions = [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 },
      { width: 1600, height: 900 },
      { width: 2560, height: 1600 },
      { width: 3840, height: 2160 },
    ];
    for (let i = 0; i < 30; i++) {
      const fp = engine.generateFingerprint();
      const match = validResolutions.some(
        (r) => r.width === fp.screenWidth && r.height === fp.screenHeight
      );
      expect(match).toBe(true);
    }
  });

  it('colorDepth is 24', () => {
    const fp = engine.generateFingerprint();
    expect(fp.colorDepth).toBe(24);
  });

  it('webrtcPolicy is a valid value', () => {
    const valid = ['default', 'disable_non_proxied_udp', 'proxy_only'];
    for (let i = 0; i < 20; i++) {
      const fp = engine.generateFingerprint();
      expect(valid).toContain(fp.webrtcPolicy);
    }
  });

  it('canvas.seed is a positive integer', () => {
    for (let i = 0; i < 20; i++) {
      const fp = engine.generateFingerprint();
      expect(fp.canvas.seed).toBeGreaterThan(0);
      expect(Number.isInteger(fp.canvas.seed)).toBe(true);
    }
  });

  it('fonts array is non-empty', () => {
    for (let i = 0; i < 20; i++) {
      const fp = engine.generateFingerprint();
      expect(fp.fonts.length).toBeGreaterThan(0);
    }
  });
});

// ─── P4: Fingerprint Uniqueness (canvas.seed) ─────────────────────────────────

describe('FingerprintEngine — P4: canvas.seed uniqueness', () => {
  let engine: FingerprintEngine;

  beforeEach(async () => {
    engine = new FingerprintEngine();
    await engine.initialize();
  });

  it('generates unique canvas seeds across many fingerprints', () => {
    const N = 100;
    const seeds = new Set<number>();
    for (let i = 0; i < N; i++) {
      const fp = engine.generateFingerprint();
      seeds.add(fp.canvas.seed);
    }
    // Allow very small collision rate (< 5%) for random generation
    expect(seeds.size).toBeGreaterThan(N * 0.95);
  });
});

// ─── UA platform matching ──────────────────────────────────────────────────────

describe('detectOsFromUA / extractPlatformFromUA', () => {
  it('detects Windows UA', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(detectOsFromUA(ua)).toBe('windows');
    expect(extractPlatformFromUA(ua)).toBe('Win32');
  });

  it('detects Mac UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    expect(detectOsFromUA(ua)).toBe('mac');
    expect(extractPlatformFromUA(ua)).toBe('MacIntel');
  });

  it('detects Linux UA', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
    expect(detectOsFromUA(ua)).toBe('linux');
    expect(extractPlatformFromUA(ua)).toBe('Linux x86_64');
  });
});

// ─── prepareExtension ─────────────────────────────────────────────────────────

describe('FingerprintEngine — prepareExtension', () => {
  let tmpDir: string;
  let engine: FingerprintEngine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fp-ext-test-'));
    engine = new FingerprintEngine();
    await engine.initialize();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates manifest.json and content_script.js', async () => {
    const fp = engine.generateFingerprint();
    const extDir = await engine.prepareExtension('test-profile-id', fp, tmpDir);

    const manifestPath = path.join(extDir, 'manifest.json');
    const scriptPath = path.join(extDir, 'content_script.js');

    const manifestStat = await fs.stat(manifestPath);
    const scriptStat = await fs.stat(scriptPath);

    expect(manifestStat.isFile()).toBe(true);
    expect(scriptStat.isFile()).toBe(true);
  });

  it('manifest.json has correct structure', async () => {
    const fp = engine.generateFingerprint();
    const extDir = await engine.prepareExtension('test-profile-id', fp, tmpDir);

    const manifest = JSON.parse(await fs.readFile(path.join(extDir, 'manifest.json'), 'utf-8')) as Record<string, unknown>;
    expect(manifest['manifest_version']).toBe(3);
    expect(manifest['name']).toBeTruthy();
    const scripts = manifest['content_scripts'] as Array<Record<string, unknown>>;
    expect(scripts[0]?.['world']).toBe('MAIN');
  });

  it('content_script.js contains fingerprint values', async () => {
    const fp = engine.generateFingerprint();
    const extDir = await engine.prepareExtension('test-profile-id', fp, tmpDir);

    const script = await fs.readFile(path.join(extDir, 'content_script.js'), 'utf-8');
    expect(script).toContain(fp.userAgent);
    expect(script).toContain(fp.platform);
    expect(script).toContain(String(fp.canvas.seed));
  });

  it('creates separate extension dirs per profile', async () => {
    const fp1 = engine.generateFingerprint();
    const fp2 = engine.generateFingerprint();

    const dir1 = await engine.prepareExtension('profile-1', fp1, tmpDir);
    const dir2 = await engine.prepareExtension('profile-2', fp2, tmpDir);

    expect(dir1).not.toBe(dir2);
    expect(dir1).toContain('profile-1');
    expect(dir2).toContain('profile-2');
  });
});

// ─── FingerprintDB fallback ───────────────────────────────────────────────────

describe('FingerprintDB', () => {
  it('falls back to defaults when file does not exist', async () => {
    const db = new FingerprintDB();
    // Load from non-existent path — should not throw
    await expect(db.load()).resolves.not.toThrow();
    const data = db.get();
    expect(data.userAgents.windows.length).toBeGreaterThan(0);
  });
});
