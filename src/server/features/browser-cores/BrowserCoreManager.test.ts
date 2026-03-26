import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserCoreManager } from './BrowserCoreManager';

describe('BrowserCoreManager', () => {
  let tmpDir: string;
  let storagePath: string;
  let installRootDir: string;
  let manager: BrowserCoreManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-browser-core-manager-'));
    storagePath = path.join(tmpDir, 'browser-cores.json');
    installRootDir = path.join(tmpDir, 'browser-cores', 'installed');
    manager = new BrowserCoreManager(storagePath, installRootDir);
    await manager.initialize();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createBrowserCorePackage(name = 'Pro5 Chromium', key = 'pro5-chromium'): Promise<string> {
    const uniqueToken = Math.random().toString(16).slice(2);
    const sourceDir = path.join(tmpDir, `${key}-package-${uniqueToken}`);
    const runtimeDir = path.join(sourceDir, 'runtime');
    const executablePath = path.join(runtimeDir, 'pro5-chromium.exe');
    const packagePath = path.join(tmpDir, `${key}-${uniqueToken}.zip`);

    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'browser-core.json'),
      JSON.stringify({
        key,
        label: name,
        version: '127.0.0-preview',
        executableRelativePath: 'runtime/pro5-chromium.exe',
        channel: 'preview',
        platform: 'win32',
      }, null, 2),
      'utf-8',
    );
    await fs.writeFile(executablePath, 'stub-binary', 'utf-8');

    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(sourceDir, '*').replace(/'/g, "''")}' -DestinationPath '${packagePath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    return packagePath;
  }

  it('installs a packaged browser core and persists the managed runtime metadata', async () => {
    const packagePath = await createBrowserCorePackage();
    const runtimeMod = await import('../runtimes/RuntimeManager');
    const upsertSpy = vi.spyOn(runtimeMod.runtimeManager, 'upsertRuntime').mockResolvedValue({
      key: 'core-pro5-chromium',
      label: 'Pro5 Chromium 127.0.0-preview',
      executablePath: 'stub',
      available: true,
    });

    const installed = await manager.installFromPackage(packagePath);

    expect(installed.key).toBe('pro5-chromium');
    expect(installed.label).toBe('Pro5 Chromium');
    expect(installed.managedRuntimeKey).toBe('core-pro5-chromium');
    expect(installed.executablePath).toContain(path.join('browser-cores', 'installed'));
    expect(await fs.access(path.join(installed.installDir, 'browser-core.json')).then(() => true).catch(() => false)).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      'core-pro5-chromium',
      'Pro5 Chromium 127.0.0-preview',
      installed.executablePath,
    );

    const reloaded = new BrowserCoreManager(storagePath, installRootDir);
    await reloaded.initialize();
    expect(reloaded.listInstalledCores()).toHaveLength(1);
    expect(reloaded.listInstalledCores()[0]?.key).toBe('pro5-chromium');
  });

  it('replaces an older installed core with the same key', async () => {
    const firstPackage = await createBrowserCorePackage('Pro5 Chromium', 'pro5-chromium');
    const secondPackage = await createBrowserCorePackage('Pro5 Chromium', 'pro5-chromium');
    const runtimeMod = await import('../runtimes/RuntimeManager');
    vi.spyOn(runtimeMod.runtimeManager, 'upsertRuntime').mockResolvedValue({
      key: 'core-pro5-chromium',
      label: 'Pro5 Chromium 127.0.0-preview',
      executablePath: 'stub',
      available: true,
    });
    vi.spyOn(runtimeMod.runtimeManager, 'deleteRuntime').mockResolvedValue(undefined);

    const first = await manager.installFromPackage(firstPackage);
    const second = await manager.installFromPackage(secondPackage);

    expect(second.id).not.toBe(first.id);
    expect(manager.listInstalledCores()).toHaveLength(1);
    expect(manager.listInstalledCores()[0]?.id).toBe(second.id);
  }, 15000);

  it('deletes installed cores and unregisters their managed runtime', async () => {
    const packagePath = await createBrowserCorePackage();
    const runtimeMod = await import('../runtimes/RuntimeManager');
    vi.spyOn(runtimeMod.runtimeManager, 'upsertRuntime').mockResolvedValue({
      key: 'core-pro5-chromium',
      label: 'Pro5 Chromium 127.0.0-preview',
      executablePath: 'stub',
      available: true,
    });
    const deleteSpy = vi.spyOn(runtimeMod.runtimeManager, 'deleteRuntime').mockResolvedValue(undefined);

    const installed = await manager.installFromPackage(packagePath);
    await manager.deleteCore(installed.id);

    expect(manager.listInstalledCores()).toHaveLength(0);
    expect(deleteSpy).toHaveBeenCalledWith('core-pro5-chromium');
    expect(await fs.access(installed.installDir).then(() => true).catch(() => false)).toBe(false);
  });

  it('exposes a built-in browser core catalog with install state', async () => {
    const packagePath = await createBrowserCorePackage();
    const runtimeMod = await import('../runtimes/RuntimeManager');
    vi.spyOn(runtimeMod.runtimeManager, 'upsertRuntime').mockResolvedValue({
      key: 'core-pro5-chromium',
      label: 'Pro5 Chromium 127.0.0-preview',
      executablePath: 'stub',
      available: true,
    });

    await manager.installFromPackage(packagePath);

    const catalog = manager.listCatalog();
    expect(catalog.some((entry) => entry.key === 'pro5-chromium' && entry.installed)).toBe(true);
  });

  it('downloads and installs a package-ready catalog core from its artifact URL', async () => {
    const packagePath = await createBrowserCorePackage();
    const packageBuffer = await fs.readFile(packagePath);
    const previousUrl = process.env['PRO5_BROWSER_CORE_URL'];
    const previousVersion = process.env['PRO5_BROWSER_CORE_VERSION'];
    const runtimeMod = await import('../runtimes/RuntimeManager');
    const upsertSpy = vi.spyOn(runtimeMod.runtimeManager, 'upsertRuntime').mockResolvedValue({
      key: 'core-pro5-chromium',
      label: 'Pro5 Chromium 127.0.0-preview',
      executablePath: 'stub',
      available: true,
    });

    const artifactServer = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/zip');
      res.end(packageBuffer);
    });

    await new Promise<void>((resolve) => artifactServer.listen(0, '127.0.0.1', () => resolve()));

    try {
      const address = artifactServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind browser-core artifact server');
      }

      process.env['PRO5_BROWSER_CORE_URL'] = `http://127.0.0.1:${address.port}/pro5-chromium.zip`;
      process.env['PRO5_BROWSER_CORE_VERSION'] = '127.0.0-preview';

      const installed = await manager.installCatalogCore('pro5-chromium');

      expect(installed.key).toBe('pro5-chromium');
      expect(installed.managedRuntimeKey).toBe('core-pro5-chromium');
      expect(upsertSpy).toHaveBeenCalledWith(
        'core-pro5-chromium',
        'Pro5 Chromium 127.0.0-preview',
        installed.executablePath,
      );
    } finally {
      await new Promise<void>((resolve, reject) => artifactServer.close((err) => (err ? reject(err) : resolve())));
      if (previousUrl === undefined) {
        delete process.env['PRO5_BROWSER_CORE_URL'];
      } else {
        process.env['PRO5_BROWSER_CORE_URL'] = previousUrl;
      }
      if (previousVersion === undefined) {
        delete process.env['PRO5_BROWSER_CORE_VERSION'];
      } else {
        process.env['PRO5_BROWSER_CORE_VERSION'] = previousVersion;
      }
    }
  });
});
