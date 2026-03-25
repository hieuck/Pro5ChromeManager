import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dataPath, resolveAppPath } from '../utils/dataPaths';
import { logger } from '../utils/logger';
import { ManagedExtension, ExtensionBundle } from '../shared/types';

// Specialized Services
import { sourceResolver, ResolvedSourceInput } from './extension/SourceResolver';
import { downloader } from './extension/Downloader';
import { extractor } from './extension/Extractor';

const EXTENSIONS_PATH = dataPath('extensions.json');

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
      const isNotFound = err instanceof Error && 'code' in err && (err as any).code === 'ENOENT';
      if (!isNotFound) {
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
    const resolvedSource = sourceResolver.resolve(input.sourcePath);
    const duplicate = this.listExtensions().find((extension) => (
      sourceResolver.resolve(extension.sourcePath).key === resolvedSource.key ||
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
    logger.info('Extension added', { id: extension.id, name: extension.name });
    return extension;
  }

  async updateExtension(id: string, input: {
    name?: string;
    category?: string | null;
    enabled?: boolean;
    defaultForNewProfiles?: boolean;
  }): Promise<ManagedExtension> {
    const existing = this.extensions.get(id);
    if (!existing) throw new Error(`Extension not found: ${id}`);

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
    if (!extension) throw new Error(`Extension not found: ${id}`);

    this.extensions.delete(id);
    await this.persist();
    await this.cleanupManagedAssets(extension);
    logger.info('Extension deleted', { id });
  }

  async resolveEnabledExtensionPaths(ids: string[]): Promise<string[]> {
    const resolved: string[] = [];
    for (const id of ids) {
      const extension = this.extensions.get(id);
      if (!extension || !extension.enabled) continue;

      const available = await this.isExtensionEntryAvailable(extension.entryPath);
      if (!available) {
        logger.warn('Skipping unavailable extension', { id, entryPath: extension.entryPath });
        continue;
      }
      resolved.push(extension.entryPath);
    }
    return resolved;
  }

  listDefaultExtensionIds(): string[] {
    return Array.from(this.extensions.values())
      .filter((e) => e.enabled && e.defaultForNewProfiles)
      .map((e) => e.id);
  }

  listBundles(): ExtensionBundle[] {
    const grouped = new Map<string, ManagedExtension[]>();
    for (const e of this.extensions.values()) {
      if (!e.enabled || !e.category) continue;
      const key = e.category.trim().toLowerCase();
      if (key) grouped.set(key, [...(grouped.get(key) ?? []), e]);
    }

    return Array.from(grouped.entries())
      .map(([key, exts]) => ({
        key,
        label: key,
        extensionIds: exts.map((e) => e.id),
        extensionCount: exts.length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  resolveExtensionSelection(extensionIds?: string[], categories?: string[]): string[] {
    const selectedIds = new Set<string>(extensionIds ?? []);
    const normalizedCats = new Set((categories ?? []).map(c => c.trim().toLowerCase()).filter(Boolean));

    if (normalizedCats.size > 0) {
      for (const e of this.listExtensions()) {
        if (e.enabled && e.category && normalizedCats.has(e.category.trim().toLowerCase())) {
          selectedIds.add(e.id);
        }
      }
    }
    return Array.from(selectedIds);
  }

  async inspectExtension(sourcePath: string): Promise<any> {
    return this.inspectExtensionSource(sourceResolver.resolve(sourcePath), uuidv4());
  }

  private async inspectExtensionSource(source: ResolvedSourceInput, extensionId: string): Promise<any> {
    let entryPath: string;
    if (source.kind === 'chrome_web_store') {
      entryPath = await this.downloadAndExtractCWS(source.extensionId!, extensionId);
    } else {
      const stat = await fs.stat(source.normalizedSourcePath).catch(() => null);
      if (!stat) throw new Error(`Extension path not found: ${source.normalizedSourcePath}`);
      
      entryPath = stat.isDirectory()
        ? await extractor.resolveExtensionEntryPath(source.normalizedSourcePath)
        : await extractor.extractPackageAndResolveEntryPath(source.normalizedSourcePath, dataPath('extensions', 'packages', extensionId));
    }

    const manifest = await extractor.inspectManifest(entryPath);
    return {
      sourcePath: source.normalizedSourcePath,
      entryPath,
      ...manifest
    };
  }

  private async downloadAndExtractCWS(chromeWebStoreId: string, extensionId: string): Promise<string> {
    const managedRoot = dataPath('extensions', 'packages', extensionId);
    const archivePath = dataPath('extensions', 'downloads', `${extensionId}-${chromeWebStoreId}.crx`);
    
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    try {
      await downloader.downloadChromeWebStorePackage(chromeWebStoreId, archivePath);
      const entryPath = await extractor.extractPackageAndResolveEntryPath(archivePath, managedRoot);
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
      return entryPath;
    } catch (err) {
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
      await fs.rm(managedRoot, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  private async isExtensionEntryAvailable(entryPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(entryPath, 'manifest.json'));
      return true;
    } catch { return false; }
  }

  private async cleanupManagedAssets(extension: ManagedExtension): Promise<void> {
    const managedPackagesDir = dataPath('extensions', 'packages');
    const relativeEntryPath = path.relative(managedPackagesDir, extension.entryPath);
    const isManaged = !relativeEntryPath.startsWith('..') && !path.isAbsolute(relativeEntryPath);

    if (isManaged) {
      const packageRoot = path.join(managedPackagesDir, extension.id);
      await fs.rm(packageRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.extensionsPath), { recursive: true });
    await fs.writeFile(this.extensionsPath, JSON.stringify(this.listExtensions(), null, 2), 'utf-8');
  }
}

export const extensionManager = new ExtensionManager();
