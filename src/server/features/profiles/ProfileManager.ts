import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../core/logging/logger';
import { loggerService } from '../../core/logging/LoggerService';
import { configManager } from '../config/ConfigManager';
import { fingerprintEngine } from './FingerprintEngine';
import { extensionManager } from '../extensions/ExtensionManager';
import { bookmarkManager } from './BookmarkManager';
import { sanitizePath } from '../../core/fs/pathSanitizer';
import { dataPath, resolveAppPath } from '../../core/fs/dataPaths';
import type { Profile, SearchQuery } from '../../../shared/contracts';
import { CURRENT_SCHEMA_VERSION, migrateProfile } from './migration';
import {
  buildClonedProfile,
  buildCreatedProfile,
  buildImportedPackageProfile,
  buildImportedProfile,
} from './records';
import { createProfileArchive, extractWindowsZipArchive } from './packageArchive';
import { copyDirectory, loadProfilesFromDirectory, saveProfileRecord } from './storage';
import { 
  NotFoundError, 
  ValidationError, 
  FileSystemError, 
  InternalServerError,
  ConflictError
} from '../../core/errors';

export class ProfileManager {
  private profiles: Map<string, Profile> = new Map();
  private profileDirMap: Map<string, string> = new Map();
  private profilesDir: string;
  private dataDir: string;
  private readonly listDefaultExtensionIds: () => string[];

  constructor(
    profilesDir?: string,
    dataDir?: string,
    listDefaultExtensionIds?: () => string[],
  ) {
    this.profilesDir = profilesDir ?? resolveAppPath(configManager.get().profilesDir);
    this.dataDir = dataDir ?? dataPath();
    this.listDefaultExtensionIds = listDefaultExtensionIds ?? (() => extensionManager.listDefaultExtensionIds());
  }

  async initialize(): Promise<void> {
    const loadedState = await loadProfilesFromDirectory(this.profilesDir);
    this.profiles = loadedState.profiles;
    this.profileDirMap = loadedState.profileDirMap;
    logger.info('ProfileManager initialized', { count: this.profiles.size });
  }

  async createProfile(
    name: string,
    options?: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>>,
  ): Promise<Profile> {
    // Validate input
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Profile name is required', {
        field: 'name',
        value: name,
      });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const profileDir = sanitizePath(this.profilesDir, id);
    const correlationId = loggerService.generateCorrelationId();

    try {
      // Create profile directory structure
      await fs.mkdir(profileDir, { recursive: true });
      await fs.mkdir(path.join(profileDir, 'Default'), { recursive: true });
    } catch (error) {
      throw new FileSystemError('create profile directory', profileDir, {
        correlationId,
        originalError: error instanceof Error ? error : undefined,
        context: { profileId: id, profileName: name },
      });
    }

    if (!options?.fingerprint) {
      try {
        await fingerprintEngine.initialize();
      } catch (error) {
        loggerService.warn('Fingerprint engine initialization failed, using fallback', {
          correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
        // fallback generation still works
      }
    }

    const profile = buildCreatedProfile({
      id,
      name,
      now,
      fingerprint: options?.fingerprint ?? fingerprintEngine.generateFingerprint(),
      extensionIds: options?.extensionIds ?? this.listDefaultExtensionIds(),
      options,
    });

    try {
      this.profileDirMap.set(id, id);
      await this.saveProfile(profile);
      this.profiles.set(id, profile);
      loggerService.info('Profile created successfully', {
        correlationId,
        profileId: id,
        profileName: name,
        fingerprintGenerated: !options?.fingerprint,
      });
      return profile;
    } catch (error) {
      // Cleanup on failure
      await this.cleanupFailedProfile(id, profileDir).catch(() => {
        // Ignore cleanup errors
      });
      
      throw new InternalServerError('Failed to create profile', {
        correlationId,
        originalError: error instanceof Error ? error : undefined,
        context: { profileId: id, profileName: name },
      });
    }
  }

  async cloneProfile(
    id: string,
    overrides?: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion' | 'lastUsedAt' | 'totalSessions'>>,
  ): Promise<Profile> {
    const existing = this.profiles.get(id);
    if (!existing) {
      throw new NotFoundError('Profile', id);
    }

    const cloneId = uuidv4();
    const now = new Date().toISOString();
    const sourceDir = sanitizePath(this.profilesDir, id);
    const cloneDir = sanitizePath(this.profilesDir, cloneId);

    await copyDirectory(sourceDir, cloneDir);

    const clone = buildClonedProfile({
      cloneId,
      now,
      existing,
      overrides,
    });

    this.profileDirMap.set(cloneId, cloneId);
    await this.saveProfile(clone);
    this.profiles.set(cloneId, clone);
    logger.info('Profile cloned', { sourceId: id, cloneId, name: clone.name });
    return clone;
  }

  async updateProfile(id: string, partial: Partial<Omit<Profile, 'id' | 'createdAt' | 'schemaVersion'>>): Promise<Profile> {
    const existing = this.profiles.get(id);
    if (!existing) {
      throw new NotFoundError('Profile', id);
    }

    const updated: Profile = {
      ...existing,
      ...partial,
      id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.saveProfile(updated);
    this.profiles.set(id, updated);
    return updated;
  }

  async deleteProfile(id: string): Promise<void> {
    if (!this.profiles.has(id)) {
      throw new NotFoundError('Profile', id);
    }

    const dirName = this.profileDirMap.get(id) ?? id;
    const profileDir = path.join(this.profilesDir, dirName);
    const extDir = sanitizePath(path.join(this.dataDir, 'extensions'), id);

    await fs.rm(profileDir, { recursive: true, force: true });
    await fs.rm(extDir, { recursive: true, force: true }).catch(() => undefined);

    this.profiles.delete(id);
    this.profileDirMap.delete(id);
    logger.info('Profile deleted', { id });
  }

  getProfile(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  getProfileDirectory(id: string): string {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new NotFoundError('Profile', id);
    }

    const dirName = this.profileDirMap.get(id) ?? id;
    return sanitizePath(this.profilesDir, dirName);
  }

  listProfiles(): Profile[] {
    return Array.from(this.profiles.values());
  }

  searchProfiles(query: SearchQuery): Profile[] {
    return Array.from(this.profiles.values()).filter((profile) => {
      if (query.name && !profile.name.toLowerCase().includes(query.name.toLowerCase())) {
        return false;
      }
      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some((tag) => profile.tags.includes(tag));
        if (!hasTag) {
          return false;
        }
      }
      if (query.group !== undefined && profile.group !== query.group) {
        return false;
      }
      if (query.owner !== undefined && profile.owner !== query.owner) {
        return false;
      }
      return true;
    });
  }

  async importProfile(srcDir: string): Promise<Profile> {
    const resolvedSrc = path.resolve(srcDir);
    const defaultDir = path.join(resolvedSrc, 'Default');
    const hasDefault = await fs.access(defaultDir).then(() => true).catch(() => false);

    const id = uuidv4();
    const destDir = sanitizePath(this.profilesDir, id);
    await fs.mkdir(destDir, { recursive: true });

    if (hasDefault) {
      await copyDirectory(defaultDir, path.join(destDir, 'Default'));
    }

    try {
      await fingerprintEngine.initialize();
    } catch {
      // fallback generation still works
    }

    const profile = buildImportedProfile({
      id,
      name: path.basename(resolvedSrc),
      now: new Date().toISOString(),
      bookmarks: await bookmarkManager.readBookmarks(destDir),
      fingerprint: fingerprintEngine.generateFingerprint(),
    });

    this.profileDirMap.set(id, id);
    await this.saveProfile(profile);
    this.profiles.set(id, profile);
    logger.info('Profile imported', { id, srcDir });
    return profile;
  }

  async importProfilePackage(packagePath: string): Promise<Profile> {
    const resolvedPackagePath = path.resolve(packagePath);
    const packageStat = await fs.stat(resolvedPackagePath).catch(() => null);
    if (!packageStat || !packageStat.isFile()) {
      throw new ValidationError(`Profile package not found: ${resolvedPackagePath}`, {
        field: 'packagePath',
        value: resolvedPackagePath,
      });
    }

    if (path.extname(resolvedPackagePath).toLowerCase() !== '.zip') {
      throw new ValidationError(`Unsupported profile package format: ${resolvedPackagePath}`, {
        field: 'packagePath',
        value: path.extname(resolvedPackagePath),
      });
    }

    if (process.platform !== 'win32') {
      throw new ValidationError('Profile package import is currently supported on Windows only');
    }

    const tempExtractDir = path.join(this.dataDir, 'tmp', `profile-import-${uuidv4()}`);
    await fs.rm(tempExtractDir, { recursive: true, force: true });
    await fs.mkdir(tempExtractDir, { recursive: true });

    try {
      await extractWindowsZipArchive(resolvedPackagePath, tempExtractDir);

      const rawProfile = await fs.readFile(path.join(tempExtractDir, 'profile.json'), 'utf-8').catch(() => null);
      if (!rawProfile) {
        throw new ValidationError('profile.json not found in package');
      }

      const migratedProfile = migrateProfile(
        JSON.parse(rawProfile) as Record<string, unknown>,
        CURRENT_SCHEMA_VERSION,
      ) as unknown as Profile;
      const importedId = uuidv4();
      const importedDir = sanitizePath(this.profilesDir, importedId);
      const now = new Date().toISOString();

      await fs.mkdir(importedDir, { recursive: true });

      const packagedDefaultDir = path.join(tempExtractDir, 'Default');
      const hasDefaultDir = await fs.stat(packagedDefaultDir).then((stat) => stat.isDirectory()).catch(() => false);
      if (hasDefaultDir) {
        await copyDirectory(packagedDefaultDir, path.join(importedDir, 'Default'));
      } else {
        await fs.mkdir(path.join(importedDir, 'Default'), { recursive: true });
      }

      const cookiesPath = path.join(tempExtractDir, 'cookies.json');
      const hasCookies = await fs.access(cookiesPath).then(() => true).catch(() => false);
      if (hasCookies) {
        await fs.copyFile(cookiesPath, path.join(importedDir, 'cookies.json'));
      }

      let importedBookmarks = migratedProfile.bookmarks ?? [];
      if (importedBookmarks.length === 0) {
        importedBookmarks = await bookmarkManager.readBookmarks(importedDir);
      }

      const profile = buildImportedPackageProfile({
        importedId,
        now,
        migratedProfile,
        importedBookmarks,
        fallbackFingerprint: fingerprintEngine.generateFingerprint(),
      });

      this.profileDirMap.set(importedId, importedId);
      await this.saveProfile(profile);
      this.profiles.set(importedId, profile);
      logger.info('Profile package imported', {
        id: importedId,
        name: profile.name,
        packagePath: resolvedPackagePath,
      });
      return profile;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new FileSystemError('import profile package', resolvedPackagePath, {
        originalError: error instanceof Error ? error : undefined,
      });
    } finally {
      await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async exportProfile(id: string, destPath: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new NotFoundError('Profile', id);
    }

    const dirName = this.profileDirMap.get(id) ?? id;
    await createProfileArchive({
      profile,
      profileDir: path.join(this.profilesDir, dirName),
      destPath,
    });
    logger.info('Profile exported', { id, destPath });
  }

  async updateLastUsed(id: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new NotFoundError('Profile', id);
    }

    const updated: Profile = {
      ...profile,
      lastUsedAt: new Date().toISOString(),
      totalSessions: profile.totalSessions + 1,
      updatedAt: new Date().toISOString(),
    };

    await this.saveProfile(updated);
    this.profiles.set(id, updated);
  }

  private async saveProfile(profile: Profile): Promise<void> {
    await saveProfileRecord({
      profilesDir: this.profilesDir,
      profileDirMap: this.profileDirMap,
      profile,
    });
  }

  private async cleanupFailedProfile(id: string, profileDir: string): Promise<void> {
    this.profiles.delete(id);
    this.profileDirMap.delete(id);
    await fs.rm(profileDir, { recursive: true, force: true });
  }
}

export const profileManager = new ProfileManager();
