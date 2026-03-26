import { describe, it, expect, vi, afterEach } from 'vitest';
import { RuntimeManager } from './RuntimeManager';
import type { AppConfig } from '../config/ConfigManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(runtimes: Record<string, { label: string; executablePath: string }>): AppConfig {
  return {
    configVersion: 1,
    onboardingCompleted: false,
    uiLanguage: 'vi',
    locale: 'vi-VN',
    timezoneId: 'Asia/Saigon',
    defaultRuntime: 'auto',
    headless: false,
    windowTitleSuffixEnabled: true,
    profilesDir: './data/profiles',
    api: { host: '127.0.0.1', port: 3210 },
    sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
    runtimes,
  };
}

/** Build a RuntimeManager with a controlled accessFn and pre-loaded config */
async function buildManager(
  runtimes: Record<string, { label: string; executablePath: string }>,
  accessFn: (p: string) => Promise<void>,
): Promise<RuntimeManager> {
  const configMod = await import('../config/ConfigManager');
  vi.spyOn(configMod.configManager, 'get').mockReturnValue(makeConfig(runtimes));
  vi.spyOn(configMod.configManager, 'update').mockResolvedValue(makeConfig(runtimes));

  const manager = new RuntimeManager(accessFn);
  await manager.initialize();
  return manager;
}

// ─── checkAvailability ────────────────────────────────────────────────────────

describe('RuntimeManager — availability check', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when accessFn resolves', async () => {
    const manager = new RuntimeManager(async () => { /* success */ });
    expect(await manager.checkAvailability('/path/to/chrome.exe')).toBe(true);
  });

  it('returns false when accessFn throws ENOENT', async () => {
    const manager = new RuntimeManager(async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await manager.checkAvailability('/nonexistent/chrome.exe')).toBe(false);
  });

  it('returns false when accessFn throws EACCES', async () => {
    const manager = new RuntimeManager(async () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });
    expect(await manager.checkAvailability('/restricted/chrome.exe')).toBe(false);
  });
});

// ─── resolveRuntime ───────────────────────────────────────────────────────────

describe('RuntimeManager — resolveRuntime', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('resolves "auto" to centbrowser first (highest priority)', async () => {
    const manager = await buildManager(
      {
        chrome: { label: 'Chrome', executablePath: '/usr/bin/chrome' },
        centbrowser: { label: 'CentBrowser', executablePath: '/usr/bin/centbrowser' },
        msedge: { label: 'Edge', executablePath: '/usr/bin/msedge' },
      },
      async () => { /* all available */ },
    );

    const resolved = await manager.resolveRuntime('auto');
    expect(resolved).toBe('/usr/bin/centbrowser');
  });

  it('resolves "auto" skipping unavailable runtimes', async () => {
    const manager = await buildManager(
      {
        centbrowser: { label: 'CentBrowser', executablePath: '/usr/bin/centbrowser' },
        chrome: { label: 'Chrome', executablePath: '/usr/bin/chrome' },
      },
      async (p) => {
        if (p.includes('centbrowser')) throw new Error('ENOENT');
        // chrome is available
      },
    );

    const resolved = await manager.resolveRuntime('auto');
    expect(resolved).toBe('/usr/bin/chrome');
  });

  it('throws when no runtime is available for "auto"', async () => {
    const manager = await buildManager(
      { chrome: { label: 'Chrome', executablePath: '/usr/bin/chrome' } },
      async () => { throw new Error('ENOENT'); },
    );

    await expect(manager.resolveRuntime('auto')).rejects.toThrow('No available runtime found');
  });

  it('resolves specific key when available', async () => {
    const manager = await buildManager(
      { chrome: { label: 'Chrome', executablePath: '/usr/bin/chrome' } },
      async () => { /* available */ },
    );

    const resolved = await manager.resolveRuntime('chrome');
    expect(resolved).toBe('/usr/bin/chrome');
  });

  it('throws when specific key is not found', async () => {
    const manager = new RuntimeManager(async () => { /* available */ });
    await expect(manager.resolveRuntime('nonexistent')).rejects.toThrow('Runtime not found');
  });

  it('throws when specific key exists but is unavailable', async () => {
    const manager = await buildManager(
      { chrome: { label: 'Chrome', executablePath: '/usr/bin/chrome' } },
      async () => { throw new Error('ENOENT'); },
    );

    await expect(manager.resolveRuntime('chrome')).rejects.toThrow('Runtime not available');
  });

  it('auto falls back to any available runtime when none match priority list', async () => {
    const manager = await buildManager(
      { myBrowser: { label: 'MyBrowser', executablePath: '/opt/mybrowser' } },
      async () => { /* available */ },
    );

    const resolved = await manager.resolveRuntime('auto');
    expect(resolved).toBe('/opt/mybrowser');
  });
});
