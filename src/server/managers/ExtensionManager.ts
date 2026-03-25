import fs from 'fs/promises';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { dataPath, resolveAppPath } from '../utils/dataPaths';
import { logger } from '../utils/logger';

export interface ManagedExtension {
  id: string;
  name: string;
  sourcePath: string;
  entryPath: string;
  version: string | null;
  description: string | null;
  category: string | null;
  enabled: boolean;
  defaultForNewProfiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionBundle {
  key: string;
  label: string;
  extensionIds: string[];
  extensionCount: number;
}

interface ManifestShape {
  name?: string;
  version?: string;
  description?: string;
}

interface ResolvedSourceInput {
  kind: 'path' | 'chrome_web_store';
  originalSourcePath: string;
  normalizedSourcePath: string;
  key: string;
  extensionId?: string;
}

const EXTENSIONS_PATH = dataPath('extensions.json');
const extractZip = promisify(execFile);
const CHROME_WEB_STORE_ID_PATTERN = /^[a-p]{32}$/i;
const DEFAULT_CWS_DOWNLOAD_URL_TEMPLATE = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion={prodversion}&acceptformat=crx3&x=id%3D{id}%26uc';

export class ExtensionManager {
  private readonly extensionsPath: string;
  private extensions: Map<string, ManagedExtension> = new Map();

  constructor(extensionsPath?: string) {
    this.extensionsPath = extensionsPath ?? EXTENSIONS_PATH;
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.extensionsPath, 'utf-8');
      const parsed = JSON.parse(raw) as ManagedExtension[];
      this.extensions = new Map(parsed.map((extension) => [extension.id, {
        ...extension,
        category: extension.category ?? null,
        defaultForNewProfiles: extension.defaultForNewProfiles ?? false,
      }]));
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : null;
      if (code !== 'ENOENT') {
        logger.warn('ExtensionManager: failed to load extensions.json', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.extensions = new Map();
      await this.persist();
    }

    logger.info('ExtensionManager initialized', { count: this.extensions.size });
  }

  listExtensions(): ManagedExtension[] {
    return Array.from(this.extensions.values())
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));
  }

  getExtension(id: string): ManagedExtension | undefined {
    return this.extensions.get(id);
  }

  async addExtension(input: {
    sourcePath: string;
    name?: string;
    category?: string | null;
    enabled?: boolean;
    defaultForNewProfiles?: boolean;
  }): Promise<ManagedExtension> {
    const resolvedSource = this.resolveSourceInput(input.sourcePath);
    const duplicate = this.listExtensions().find((extension) => (
      this.resolveSourceInput(extension.sourcePath).key === resolvedSource.key ||
      extension.entryPath === resolvedSource.normalizedSourcePath
    ));
    if (duplicate) {
      throw new Error(`Extension already added: ${duplicate.name}`);
    }

    const extensionId = uuidv4();
    const inspected = await this.inspectExtensionSource(resolvedSource, extensionId);
    const now = new Date().toISOString();

    const extension: ManagedExtension = {
      id: extensionId,
      name: input.name?.trim() || inspected.name,
      sourcePath: inspected.sourcePath,
      entryPath: inspected.entryPath,
      version: inspected.version,
      description: inspected.description,
      category: input.category?.trim() || null,
      enabled: input.enabled ?? true,
      defaultForNewProfiles: input.defaultForNewProfiles ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.extensions.set(extension.id, extension);
    await this.persist();
    logger.info('Extension added', { id: extension.id, name: extension.name, entryPath: extension.entryPath });
    return extension;
  }

  async updateExtension(id: string, input: {
    name?: string;
    category?: string | null;
    enabled?: boolean;
    defaultForNewProfiles?: boolean;
  }): Promise<ManagedExtension> {
    const existing = this.extensions.get(id);
    if (!existing) {
      throw new Error(`Extension not found: ${id}`);
    }

    const updated: ManagedExtension = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name.trim() || existing.name } : {}),
      ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.defaultForNewProfiles !== undefined ? { defaultForNewProfiles: input.defaultForNewProfiles } : {}),
      updatedAt: new Date().toISOString(),
    };

    this.extensions.set(id, updated);
    await this.persist();
    return updated;
  }

  async deleteExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id);
    if (!extension) {
      throw new Error(`Extension not found: ${id}`);
    }

    this.extensions.delete(id);
    await this.persist();
    await this.cleanupManagedAssets(extension);
    logger.info('Extension deleted', { id });
  }

  async resolveEnabledExtensionPaths(ids: string[]): Promise<string[]> {
    const resolved: string[] = [];

    for (const id of ids) {
      const extension = this.extensions.get(id);
      if (!extension || !extension.enabled) {
        continue;
      }

      const available = await this.isExtensionEntryAvailable(extension.entryPath);
      if (!available) {
        logger.warn('Skipping unavailable extension during launch', { id: extension.id, entryPath: extension.entryPath });
        continue;
      }

      resolved.push(extension.entryPath);
    }

    return resolved;
  }

  listDefaultExtensionIds(): string[] {
    return this.listExtensions()
      .filter((extension) => extension.enabled && extension.defaultForNewProfiles)
      .map((extension) => extension.id);
  }

  listBundles(): ExtensionBundle[] {
    const grouped = new Map<string, ManagedExtension[]>();

    for (const extension of this.listExtensions()) {
      if (!extension.enabled || !extension.category) {
        continue;
      }

      const key = extension.category.trim().toLowerCase();
      if (!key) {
        continue;
      }

      grouped.set(key, [...(grouped.get(key) ?? []), extension]);
    }

    return Array.from(grouped.entries())
      .map(([key, extensions]) => ({
        key,
        label: key,
        extensionIds: extensions.map((extension) => extension.id),
        extensionCount: extensions.length,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'en', { sensitivity: 'base' }));
  }

  resolveExtensionSelection(extensionIds?: string[], categories?: string[]): string[] {
    const selectedIds = new Set<string>(extensionIds ?? []);
    const normalizedCategories = new Set((categories ?? [])
      .map((category) => category.trim().toLowerCase())
      .filter(Boolean));

    if (normalizedCategories.size === 0) {
      return Array.from(selectedIds);
    }

    for (const extension of this.listExtensions()) {
      if (!extension.enabled || !extension.category) {
        continue;
      }
      if (normalizedCategories.has(extension.category.trim().toLowerCase())) {
        selectedIds.add(extension.id);
      }
    }

    return Array.from(selectedIds);
  }

  async inspectExtension(sourcePath: string): Promise<{
    sourcePath: string;
    entryPath: string;
    name: string;
    version: string | null;
    description: string | null;
  }> {
    return this.inspectExtensionSource(this.resolveSourceInput(sourcePath), uuidv4());
  }

  private async inspectExtensionSource(source: ResolvedSourceInput, extensionId: string): Promise<{
    sourcePath: string;
    entryPath: string;
    name: string;
    version: string | null;
    description: string | null;
  }> {
    const entryPath = source.kind === 'chrome_web_store'
      ? await this.downloadChromeWebStorePackageAndResolveEntryPath(source.extensionId ?? '', extensionId)
      : await this.inspectPathSource(source.normalizedSourcePath, extensionId);

    const manifestPath = path.join(entryPath, 'manifest.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf-8').catch(() => null);
    if (!manifestRaw) {
      throw new Error(`manifest.json not found in extension: ${entryPath}`);
    }

    let manifest: ManifestShape;
    try {
      manifest = JSON.parse(manifestRaw) as ManifestShape;
    } catch {
      throw new Error(`Invalid manifest.json: ${manifestPath}`);
    }

    return {
      sourcePath: source.normalizedSourcePath,
      entryPath,
      name: manifest.name?.trim() || path.basename(entryPath),
      version: manifest.version?.trim() || null,
      description: manifest.description?.trim() || null,
    };
  }

  private async resolveExtensionEntryPath(rootPath: string): Promise<string> {
    const directManifest = await fs.access(path.join(rootPath, 'manifest.json')).then(() => true).catch(() => false);
    if (directManifest) {
      return rootPath;
    }

    const firstLevelEntries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => []);
    for (const entry of firstLevelEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const nestedPath = path.join(rootPath, entry.name);
      const nestedManifest = await fs.access(path.join(nestedPath, 'manifest.json')).then(() => true).catch(() => false);
      if (nestedManifest) {
        return nestedPath;
      }
    }

    throw new Error(`manifest.json not found in extension: ${rootPath}`);
  }

  private resolveSourceInput(sourcePath: string): ResolvedSourceInput {
    const trimmed = sourcePath.trim();
    const chromeWebStoreId = this.extractChromeWebStoreId(trimmed);
    if (chromeWebStoreId) {
      return {
        kind: 'chrome_web_store',
        originalSourcePath: trimmed,
        normalizedSourcePath: trimmed,
        key: `chrome-web-store:${chromeWebStoreId}`,
        extensionId: chromeWebStoreId,
      };
    }

    const normalizedPath = resolveAppPath(trimmed);
    return {
      kind: 'path',
      originalSourcePath: trimmed,
      normalizedSourcePath: normalizedPath,
      key: `path:${normalizedPath.toLowerCase()}`,
    };
  }

  private extractChromeWebStoreId(sourcePath: string): string | null {
    const normalized = sourcePath.trim();
    if (CHROME_WEB_STORE_ID_PATTERN.test(normalized)) {
      return normalized.toLowerCase();
    }

    try {
      const url = new URL(normalized);
      const hostname = url.hostname.toLowerCase();
      const isChromeWebStoreHost = hostname === 'chromewebstore.google.com' || hostname === 'chrome.google.com';
      if (!isChromeWebStoreHost) {
        return null;
      }

      const segments = url.pathname.split('/').filter(Boolean);
      const detailIndex = segments.findIndex((segment) => segment === 'detail');
      if (detailIndex >= 0 && segments[detailIndex + 2] && CHROME_WEB_STORE_ID_PATTERN.test(segments[detailIndex + 2])) {
        return segments[detailIndex + 2].toLowerCase();
      }

      const tail = segments.at(-1);
      return tail && CHROME_WEB_STORE_ID_PATTERN.test(tail) ? tail.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  private async inspectPathSource(sourcePath: string, extensionId: string): Promise<string> {
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat) {
      throw new Error(`Extension path not found: ${sourcePath}`);
    }

    return stat.isDirectory()
      ? this.resolveExtensionEntryPath(sourcePath)
      : this.extractPackageAndResolveEntryPath(sourcePath, extensionId);
  }

  private async downloadChromeWebStorePackageAndResolveEntryPath(chromeWebStoreId: string, extensionId: string): Promise<string> {
    const managedRoot = dataPath('extensions', 'packages', extensionId);
    const archivePath = dataPath('extensions', 'downloads', `${extensionId}-${chromeWebStoreId}.crx`);
    await fs.rm(managedRoot, { recursive: true, force: true });
    await fs.mkdir(managedRoot, { recursive: true });
    await fs.mkdir(path.dirname(archivePath), { recursive: true });

    try {
      await this.downloadChromeWebStorePackage(chromeWebStoreId, archivePath);
      const entryPath = await this.extractPackageAndResolveEntryPath(archivePath, extensionId);
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
      return entryPath;
    } catch (err) {
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
      await fs.rm(managedRoot, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  private async downloadChromeWebStorePackage(chromeWebStoreId: string, destinationPath: string): Promise<void> {
    const response = await fetch(this.buildChromeWebStoreDownloadUrl(chromeWebStoreId), {
      redirect: 'follow',
      headers: {
        'User-Agent': `Pro5ChromeManager/${process.env['npm_package_version'] ?? '1.0.0'}`,
      },
    }).catch((err) => {
      throw new Error(`Failed to download Chrome Web Store package: ${err instanceof Error ? err.message : String(err)}`);
    });

    if (!response.ok) {
      throw new Error(`Chrome Web Store returned ${response.status} while downloading ${chromeWebStoreId}`);
    }

    const archiveBytes = Buffer.from(await response.arrayBuffer());
    if (archiveBytes.length === 0) {
      throw new Error(`Chrome Web Store package is empty: ${chromeWebStoreId}`);
    }

    await fs.writeFile(destinationPath, archiveBytes);
  }

  private buildChromeWebStoreDownloadUrl(chromeWebStoreId: string): string {
    const template = process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] ?? DEFAULT_CWS_DOWNLOAD_URL_TEMPLATE;
    const prodversion = process.env['PRO5_EXTENSION_STORE_PRODVERSION'] ?? '131.0.0.0';
    return template
      .replaceAll('{id}', encodeURIComponent(chromeWebStoreId))
      .replaceAll('{prodversion}', encodeURIComponent(prodversion));
  }

  private async extractPackageAndResolveEntryPath(sourcePath: string, extensionId: string): Promise<string> {
    const extension = path.extname(sourcePath).toLowerCase();
    if (!['.zip', '.crx'].includes(extension)) {
      throw new Error(`Unsupported extension package: ${sourcePath}`);
    }
    if (process.platform !== 'win32') {
      throw new Error('ZIP/CRX extension import is currently supported on Windows only');
    }

    const managedRoot = dataPath('extensions', 'packages', extensionId);
    const archivePath = path.join(managedRoot, extension === '.crx' ? '__package.zip' : path.basename(sourcePath));
    await fs.rm(managedRoot, { recursive: true, force: true });
    await fs.mkdir(managedRoot, { recursive: true });

    try {
      if (extension === '.crx') {
        await this.convertCrxToZip(sourcePath, archivePath);
      }
      await extractZip('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${(extension === '.crx' ? archivePath : sourcePath).replace(/'/g, "''")}' -DestinationPath '${managedRoot.replace(/'/g, "''")}' -Force`,
      ]);
      if (extension === '.crx') {
        await fs.rm(archivePath, { force: true }).catch(() => undefined);
      }
      return await this.resolveExtensionEntryPath(managedRoot);
    } catch (err) {
      await fs.rm(managedRoot, { recursive: true, force: true }).catch(() => undefined);
      throw new Error(`Failed to extract extension package: ${sourcePath}`);
    }
  }

  private async convertCrxToZip(sourcePath: string, zipPath: string): Promise<void> {
    const crxBuffer = await fs.readFile(sourcePath);
    const zipStart = crxBuffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (zipStart < 0) {
      throw new Error(`Invalid CRX package: ${sourcePath}`);
    }

    await fs.writeFile(zipPath, crxBuffer.subarray(zipStart));
  }

  private async isExtensionEntryAvailable(entryPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(entryPath, 'manifest.json'));
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupManagedAssets(extension: ManagedExtension): Promise<void> {
    const managedPackagesDir = dataPath('extensions', 'packages');
    const relativeEntryPath = path.relative(managedPackagesDir, extension.entryPath);
    const isManagedPackage = !relativeEntryPath.startsWith('..') && !path.isAbsolute(relativeEntryPath);

    if (!isManagedPackage) {
      return;
    }

    const packageRoot = path.join(managedPackagesDir, extension.id);
    await fs.rm(packageRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.extensionsPath), { recursive: true });
    await fs.writeFile(
      this.extensionsPath,
      JSON.stringify(this.listExtensions(), null, 2),
      'utf-8',
    );
  }
}

export const extensionManager = new ExtensionManager();
