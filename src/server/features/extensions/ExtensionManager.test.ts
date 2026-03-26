import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExtensionManager } from './ExtensionManager';

describe('ExtensionManager', () => {
  let tmpDir: string;
  let extensionsPath: string;
  let manager: ExtensionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-extension-manager-'));
    extensionsPath = path.join(tmpDir, 'extensions.json');
    manager = new ExtensionManager(extensionsPath);
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createExtensionFixture(name = 'Sample Extension'): Promise<string> {
    const extensionDir = path.join(tmpDir, name.replace(/\s+/g, '-').toLowerCase());
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name,
      version: '1.2.3',
      description: 'Fixture extension',
    }, null, 2), 'utf-8');
    return extensionDir;
  }

  async function createZipFixture(name = 'Packaged Extension'): Promise<string> {
    const extensionDir = await createExtensionFixture(name);
    const zipPath = path.join(tmpDir, `${name.replace(/\s+/g, '-').toLowerCase()}.zip`);
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(extensionDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );
    return zipPath;
  }

  async function createCrxFixture(name = 'CRX Extension'): Promise<string> {
    const zipPath = await createZipFixture(name);
    const crxPath = path.join(tmpDir, `${name.replace(/\s+/g, '-').toLowerCase()}.crx`);
    const zipBytes = await fs.readFile(zipPath);
    const header = Buffer.alloc(16);
    header.write('Cr24', 0, 'ascii');
    header.writeUInt32LE(3, 4);
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(0, 12);
    await fs.writeFile(crxPath, Buffer.concat([header, zipBytes]));
    return crxPath;
  }

  async function startStoreServer(crxPath: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/download')) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }

      const payload = await fs.readFile(crxPath);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/x-chrome-extension');
      res.end(payload);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind mock extension store server');
    }

    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      },
    };
  }

  it('adds and persists unpacked extensions from a manifest directory', async () => {
    const sourcePath = await createExtensionFixture();

    const extension = await manager.addExtension({
      sourcePath,
      category: 'wallet',
      defaultForNewProfiles: true,
    });

    expect(extension.name).toBe('Sample Extension');
    expect(extension.version).toBe('1.2.3');
    expect(extension.enabled).toBe(true);
    expect(extension.entryPath).toBe(sourcePath);
    expect(extension.category).toBe('wallet');
    expect(extension.defaultForNewProfiles).toBe(true);

    const reloaded = new ExtensionManager(extensionsPath);
    await reloaded.initialize();
    expect(reloaded.listExtensions()).toHaveLength(1);
    expect(reloaded.listExtensions()[0]?.name).toBe('Sample Extension');
  });

  it('resolves only enabled and available extension paths', async () => {
    const sourcePath = await createExtensionFixture();
    const enabled = await manager.addExtension({ sourcePath });
    const disabled = await manager.addExtension({
      sourcePath: await createExtensionFixture('Disabled Extension'),
      enabled: false,
    });

    const paths = await manager.resolveEnabledExtensionPaths([enabled.id, disabled.id, 'missing']);

    expect(paths).toEqual([enabled.entryPath]);
  });

  it('imports packaged extensions from a zip archive into managed storage', async () => {
    const zipPath = await createZipFixture();

    const extension = await manager.addExtension({ sourcePath: zipPath });

    expect(extension.sourcePath).toBe(zipPath);
    expect(extension.entryPath).not.toBe(zipPath);
    expect(extension.entryPath).toContain(path.join('extensions', 'packages'));
    expect(await fs.access(path.join(extension.entryPath, 'manifest.json')).then(() => true).catch(() => false)).toBe(true);
  });

  it('imports packaged extensions from a crx archive into managed storage', async () => {
    const crxPath = await createCrxFixture();

    const extension = await manager.addExtension({ sourcePath: crxPath });

    expect(extension.sourcePath).toBe(crxPath);
    expect(extension.entryPath).not.toBe(crxPath);
    expect(extension.entryPath).toContain(path.join('extensions', 'packages'));
    expect(await fs.access(path.join(extension.entryPath, 'manifest.json')).then(() => true).catch(() => false)).toBe(true);
  });

  it('imports extensions from a Chrome Web Store id into managed storage', async () => {
    const crxPath = await createCrxFixture('Store ID Extension');
    const storeServer = await startStoreServer(crxPath);
    const previousTemplate = process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'];
    process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] = `${storeServer.baseUrl}/download?id={id}`;

    try {
      const extension = await manager.addExtension({ sourcePath: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });

      expect(extension.sourcePath).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(extension.entryPath).toContain(path.join('extensions', 'packages'));
      expect(await fs.access(path.join(extension.entryPath, 'manifest.json')).then(() => true).catch(() => false)).toBe(true);
    } finally {
      if (previousTemplate === undefined) {
        delete process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'];
      } else {
        process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] = previousTemplate;
      }
      await storeServer.close();
    }
  });

  it('imports extensions from a Chrome Web Store URL into managed storage', async () => {
    const crxPath = await createCrxFixture('Store URL Extension');
    const storeServer = await startStoreServer(crxPath);
    const previousTemplate = process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'];
    process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] = `${storeServer.baseUrl}/download?id={id}`;

    try {
      const extension = await manager.addExtension({
        sourcePath: 'https://chromewebstore.google.com/detail/sample-extension/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });

      expect(extension.sourcePath).toBe('https://chromewebstore.google.com/detail/sample-extension/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(extension.entryPath).toContain(path.join('extensions', 'packages'));
      expect(await fs.access(path.join(extension.entryPath, 'manifest.json')).then(() => true).catch(() => false)).toBe(true);
    } finally {
      if (previousTemplate === undefined) {
        delete process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'];
      } else {
        process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] = previousTemplate;
      }
      await storeServer.close();
    }
  });

  it('updates extension labels and enabled state', async () => {
    const sourcePath = await createExtensionFixture();
    const extension = await manager.addExtension({ sourcePath });

    const updated = await manager.updateExtension(extension.id, {
      name: 'Renamed Extension',
      category: 'utility',
      enabled: false,
      defaultForNewProfiles: true,
    });

    expect(updated.name).toBe('Renamed Extension');
    expect(updated.category).toBe('utility');
    expect(updated.enabled).toBe(false);
    expect(updated.defaultForNewProfiles).toBe(true);
  });

  it('returns only enabled default extensions for new profiles', async () => {
    const defaultExtension = await manager.addExtension({
      sourcePath: await createExtensionFixture('Default Extension'),
      defaultForNewProfiles: true,
    });
    await manager.addExtension({
      sourcePath: await createExtensionFixture('Disabled Default Extension'),
      defaultForNewProfiles: true,
      enabled: false,
    });
    await manager.addExtension({
      sourcePath: await createExtensionFixture('Regular Extension'),
      defaultForNewProfiles: false,
    });

    expect(manager.listDefaultExtensionIds()).toEqual([defaultExtension.id]);
  });

  it('groups enabled extensions into bundles by category and resolves selections', async () => {
    const walletA = await manager.addExtension({
      sourcePath: await createExtensionFixture('Wallet A'),
      category: 'wallet',
    });
    const walletB = await manager.addExtension({
      sourcePath: await createExtensionFixture('Wallet B'),
      category: 'wallet',
    });
    const disabledWallet = await manager.addExtension({
      sourcePath: await createExtensionFixture('Disabled Wallet'),
      category: 'wallet',
      enabled: false,
    });
    const automation = await manager.addExtension({
      sourcePath: await createExtensionFixture('Automation Helper'),
      category: 'automation',
    });

    expect(manager.listBundles()).toEqual([
      {
        key: 'automation',
        label: 'automation',
        extensionIds: [automation.id],
        extensionCount: 1,
      },
      {
        key: 'wallet',
        label: 'wallet',
        extensionIds: [walletA.id, walletB.id],
        extensionCount: 2,
      },
    ]);

    expect(manager.resolveExtensionSelection([walletA.id], ['wallet'])).toEqual([walletA.id, walletB.id]);
    expect(manager.resolveExtensionSelection([], ['wallet', 'automation'])).toEqual([
      automation.id,
      walletA.id,
      walletB.id,
    ]);
    expect(manager.resolveExtensionSelection([disabledWallet.id], ['wallet'])).toContain(disabledWallet.id);
  });

  it('rejects missing manifests', async () => {
    const missingDir = path.join(tmpDir, 'broken-extension');
    await fs.mkdir(missingDir, { recursive: true });

    await expect(manager.addExtension({ sourcePath: missingDir })).rejects.toThrow(/manifest\.json/i);
  });
});
