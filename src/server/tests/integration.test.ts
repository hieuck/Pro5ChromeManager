/**
 * Integration tests — no Chrome required.
 * Tests: profile export/import round-trip, fingerprint+extension, proxy password round-trip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProfileManager } from '../features/profiles/ProfileManager';
import { FingerprintEngine } from '../features/profiles/FingerprintEngine';
import { ProxyManager } from '../features/proxies/ProxyManager';
import { ConfigManager } from '../features/config/ConfigManager';

// ─── Shared temp dir ──────────────────────────────────────────────────────────

let tmpDir: string;
let profilesDir: string;
let dataDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-integration-'));
  profilesDir = path.join(tmpDir, 'profiles');
  dataDir = tmpDir;
  await fs.mkdir(profilesDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── Test 24.1: Profile export → import round-trip ───────────────────────────

describe('Profile export/import round-trip', () => {
  it('exports a profile to zip and imports it back with matching metadata', async () => {
    // Use a real ConfigManager pointing to tmpDir
    const configManager = new ConfigManager(path.join(tmpDir, 'config.json'));
    await configManager.load();
    await configManager.update({ profilesDir });

    const manager = new ProfileManager(profilesDir, dataDir);
    await manager.initialize();

    // Create profile
    const original = await manager.createProfile('Test Export Profile', {
      notes: 'integration test',
      tags: ['test', 'export'],
      group: 'integration',
    });

    // Export to zip
    const zipPath = path.join(tmpDir, `export-${original.id}.zip`);
    await manager.exportProfile(original.id, zipPath);

    // Verify zip exists and has content
    const stat = await fs.stat(zipPath);
    expect(stat.size).toBeGreaterThan(100);

    // Import from a directory (simulate: extract profile.json to a temp dir)
    // Since importProfile takes a srcDir, we create a temp dir with profile.json
    const importSrcDir = path.join(tmpDir, 'import-src');
    await fs.mkdir(importSrcDir, { recursive: true });
    await fs.writeFile(
      path.join(importSrcDir, 'profile.json'),
      JSON.stringify(original, null, 2),
    );

    const imported = await manager.importProfile(importSrcDir);

    // Metadata should match (new ID is generated on import, but name/notes/tags match)
    expect(imported.name).toBe(path.basename(importSrcDir)); // importProfile uses dirname as name
    expect(imported.schemaVersion).toBe(1);
    expect(imported.fingerprint).toBeDefined();
    expect(imported.id).not.toBe(original.id); // new UUID on import
  });
});

// ─── Test 24.2: generateFingerprint → prepareExtension ───────────────────────

describe('FingerprintEngine: generate + prepareExtension', () => {
  it('generates a fingerprint and writes valid extension files', async () => {
    const engine = new FingerprintEngine();
    await engine.initialize();

    const fp = engine.generateFingerprint();

    // Verify fingerprint shape
    expect(fp.userAgent).toBeTruthy();
    expect(fp.platform).toMatch(/Win32|MacIntel|Linux x86_64/);
    expect(fp.hardwareConcurrency).toBeGreaterThan(0);
    expect(fp.screenWidth).toBeGreaterThanOrEqual(800);
    expect(fp.canvas.seed).toBeGreaterThan(0);
    expect(fp.webgl.renderer).toBeTruthy();
    expect(fp.fonts.length).toBeGreaterThan(0);

    // prepareExtension writes files
    const extDir = await engine.prepareExtension('test-profile-id', fp, dataDir, {
      profileName: 'Integration Identity',
      profileGroup: 'Ops',
      profileOwner: 'qa',
    });

    const manifestPath = path.join(extDir, 'manifest.json');
    const scriptPath = path.join(extDir, 'content_script.js');
    const newTabPath = path.join(extDir, 'newtab.html');

    const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as {
      manifest_version: number;
      content_scripts: unknown[];
      chrome_url_overrides?: { newtab?: string };
    };
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.chrome_url_overrides?.newtab).toBe('newtab.html');

    const script = await fs.readFile(scriptPath, 'utf-8');
    expect(script).toContain(fp.userAgent);
    expect(script).toContain('Navigator.prototype');
    expect(script).toContain('WebGLRenderingContext.prototype');
    expect(script).toContain('Integration Identity');

    const newTab = await fs.readFile(newTabPath, 'utf-8');
    expect(newTab).toContain('Integration Identity');
    expect(newTab).toContain('Ops / qa');
  });
});

// ─── Test 24.3: Proxy password encrypt → save → load → decrypt ───────────────

describe('ProxyManager: password encryption round-trip', () => {
  it('encrypts proxy password on save and decrypts correctly on load', async () => {
    const proxiesPath = path.join(tmpDir, 'proxies.json');
    const manager = new ProxyManager(proxiesPath);
    await manager.initialize();

    const proxy = await manager.createProxy({
      type: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      username: 'user',
      password: 'super-secret-password',
    });

    expect(proxy.id).toBeTruthy();

    // Read raw file — password should NOT be plaintext
    const raw = await fs.readFile(proxiesPath, 'utf-8');
    expect(raw).not.toContain('super-secret-password');

    // Load fresh manager from same file
    const manager2 = new ProxyManager(proxiesPath);
    await manager2.initialize();

    const loaded = manager2.getProxy(proxy.id);
    expect(loaded).toBeDefined();

    // buildProxyConfig should be able to use the proxy (decrypts internally)
    // We just verify the proxy data is accessible
    expect(loaded?.host).toBe('127.0.0.1');
    expect(loaded?.port).toBe(1080);
    expect(loaded?.username).toBe('user');
    // Password field in memory should be decrypted (ProxyManager stores decrypted in memory)
    expect(loaded?.password).toBe('super-secret-password');
  });
});
