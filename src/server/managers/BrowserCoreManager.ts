import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dataPath } from '../utils/dataPaths';
import { logger } from '../utils/logger';
import { runtimeManager } from './RuntimeManager';

// Specialized Services
import { browserCoreCatalog, BrowserCoreCatalogEntry } from './browser-core/Catalog';
import { browserCoreDownloader } from './browser-core/Downloader';
import { browserCoreExtractor } from './browser-core/Extractor';

const BROWSER_CORES_PATH = dataPath('browser-cores.json');
const INSTALLED_BROWSER_CORES_DIR = dataPath('browser-cores', 'installed');

export interface BrowserCoreManifest {
  key: string;
  label: string;
  version: string;
  executableRelativePath: string;
  channel?: string | null;
  platform?: string | null;
}

export interface InstalledBrowserCore {
  id: string;
  key: string;
  label: string;
  version: string;
  channel: string | null;
  platform: string | null;
  executablePath: string;
  installDir: string;
  sourceType: 'package';
  sourcePath: string;
  managedRuntimeKey: string;
  installedAt: string;
  updatedAt: string;
}

export class BrowserCoreManager {
  private readonly storagePath: string;
  private readonly installRootDir: string;
  private cores: Map<string, InstalledBrowserCore> = new Map();

  constructor(storagePath?: string, installRootDir?: string) {
    this.storagePath = storagePath ?? BROWSER_CORES_PATH;
    this.installRootDir = installRootDir ?? INSTALLED_BROWSER_CORES_DIR;
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw) as InstalledBrowserCore[];
      this.cores = new Map(parsed.map((core) => [core.id, core]));
    } catch (err) {
      const code = err instanceof Error && 'code' in (err as any) ? (err as any).code : null;
      if (code !== 'ENOENT') {
        logger.warn('BrowserCoreManager: failed to load browser-cores.json', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.cores = new Map();
      await this.persist();
    }
    logger.info('BrowserCoreManager initialized', { count: this.cores.size });
  }

  listInstalledCores(): InstalledBrowserCore[] {
    return Array.from(this.cores.values()).sort((left, right) => right.installedAt.localeCompare(left.installedAt));
  }

  listCatalog(): Array<BrowserCoreCatalogEntry & { installed: boolean; installedCoreId: string | null }> {
    return browserCoreCatalog.getBuiltinEntries().map((entry) => {
      const installed = this.listInstalledCores().find((core) => core.key === entry.key);
      return {
        ...entry,
        installed: Boolean(installed),
        installedCoreId: installed?.id ?? null,
      };
    });
  }

  async installCatalogCore(key: string): Promise<InstalledBrowserCore> {
    const entry = this.listCatalog().find((item) => item.key === key);
    if (!entry) throw new Error(`Browser core catalog entry not found: ${key}`);
    if (!entry.artifactUrl || entry.status !== 'package-ready') {
      throw new Error(`Browser core package is not available yet: ${key}`);
    }

    const artifactUrl = browserCoreCatalog.validateArtifactUrl(entry.artifactUrl);
    const tmpDir = dataPath('tmp');
    const tmpPath = path.join(tmpDir, `browser-core-download-${key}-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });
      await browserCoreDownloader.download(artifactUrl, tmpPath);
      return await this.installFromPackage(tmpPath);
    } finally {
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    }
  }

  async installFromPackage(packagePath: string): Promise<InstalledBrowserCore> {
    const coreId = uuidv4();
    const installDir = path.join(this.installRootDir, coreId);
    await fs.mkdir(installDir, { recursive: true });
    await browserCoreExtractor.expandArchive(packagePath, installDir);

    const manifestPath = path.join(installDir, 'browser-core.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as BrowserCoreManifest;
    this.validateManifest(manifest);

    const executablePath = path.join(installDir, manifest.executableRelativePath);
    await fs.access(executablePath);

    const managedRuntimeKey = `core-${manifest.key}`;
    const existing = this.listInstalledCores().filter((core) => core.key === manifest.key);
    for (const core of existing) {
      this.cores.delete(core.id);
      await fs.rm(core.installDir, { recursive: true, force: true });
    }

    const now = new Date().toISOString();
    const installedCore: InstalledBrowserCore = {
      id: coreId,
      key: manifest.key,
      label: manifest.label,
      version: manifest.version,
      channel: manifest.channel ?? null,
      platform: manifest.platform ?? process.platform,
      executablePath,
      installDir,
      sourceType: 'package',
      sourcePath: packagePath,
      managedRuntimeKey,
      installedAt: now,
      updatedAt: now,
    };

    await runtimeManager.upsertRuntime(managedRuntimeKey, `${manifest.label} ${manifest.version}`, executablePath);
    this.cores.set(installedCore.id, installedCore);
    await this.persist();
    logger.info('Browser core installed', { id: installedCore.id, key: installedCore.key, version: installedCore.version });
    return installedCore;
  }

  async deleteCore(id: string): Promise<void> {
    const core = this.cores.get(id);
    if (!core) throw new Error(`Browser core not found: ${id}`);

    this.cores.delete(id);
    await this.persist();
    await runtimeManager.deleteRuntime(core.managedRuntimeKey).catch(() => undefined);
    await fs.rm(core.installDir, { recursive: true, force: true });
    logger.info('Browser core deleted', { id: core.id, key: core.key });
  }

  private validateManifest(manifest: BrowserCoreManifest): void {
    if (!manifest.key?.trim()) throw new Error('Invalid browser core package: missing key');
    if (!manifest.label?.trim()) throw new Error('Invalid browser core package: missing label');
    if (!manifest.version?.trim()) throw new Error('Invalid browser core package: missing version');
    if (!manifest.executableRelativePath?.trim()) throw new Error('Invalid browser core package: missing executableRelativePath');
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(this.listInstalledCores(), null, 2), 'utf-8');
  }
}

export const browserCoreManager = new BrowserCoreManager();
