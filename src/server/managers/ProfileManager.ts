import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { logger } from '../utils/logger';
import { configManager } from './ConfigManager';
import { fingerprintEngine } from './FingerprintEngine';
import type { FingerprintConfig } from './FingerprintEngine';
import { sanitizePath } from '../utils/pathSanitizer';
import { dataPath, resolveAppPath } from '../utils/dataPaths';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ProxyConfig {
  id: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface Profile {
  id: string;
  schemaVersion: number;
  name: string;
  notes: string;
  tags: string[];
  group: string | null;
  owner: string | null;
  runtime: string;
  proxy: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  totalSessions: number;
}

export interface SearchQuery {
  name?: string;
  tags?: string[];
  group?: string;
  owner?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 1;

// ─── Migration ─────────────────────────────────────────────────────────────────

export function migrateProfile(raw: Record<string, unknown>, targetVersion: number): Record<string, unknown> {
  let profile = { ...raw };
  const version = typeof profile['schemaVersion'] === 'number' ? profile['schemaVersion'] : 0;

  // v0 → v1: add missing fields
  if (version < 1 && targetVersion >= 1) {
    profile = {
      schemaVersion: 1,
      notes: '',
      tags: [],
      group: null,
      owner: null,
      runtime: 'auto',
      proxy: null,
      lastUsedAt: null,
      totalSessions: 0,
      ...profile,
    };
    profile['schemaVersion'] = 1;
  }

  return profile;
}

// ─── ProfileManager ────────────────────────────────────────────────────────────

export class ProfileManager {
  private profiles: Map<string, Profile> = new Map();
  private profilesDir: string;
  private dataDir: string;

  constructor(profilesDir?: string, dataDir?: string) {
    this.profilesDir = profilesDir ?? resolveAppPath(configManager.get().profilesDir);
    this.dataDir = dataDir ?? dataPath();
  }

  /** Scan profilesDir, load all profiles into memory, run migrations */
  async initialize(): Promise<void> {
    await fs.mkdir(this.profilesDir, { recursive: true });

    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.profilesDir);
    } catch {
      logger.warn('ProfileManager: could not read profilesDir', { dir: this.profilesDir });
      return;
    }

    for (const entry of entries) {
      const profileJsonPath = path.join(this.profilesDir, entry, 'profile.json');
      try {
        const raw = await fs.readFile(profileJsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const migrated = migrateProfile(parsed, CURRENT_SCHEMA_VERSION);
        const profile = migrated as unknown as Profile;
        this.profiles.set(profile.id, profile);
      } catch (err) {
        logger.warn('ProfileManager: failed to load profile', {
          entry,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('ProfileManager initialized', { count: this.profiles.size });
  }

  /** Create a new profile */
  async createProfile(name: string, options?: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>>): Promise<Profile> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const profileDir = sanitizePath(this.profilesDir, id);

    await fs.mkdir(profileDir, { recursive: true });
    await fs.mkdir(path.join(profileDir, 'Default'), { recursive: true });

    // Ensure fingerprint engine is ready
    if (!options?.fingerprint) {
      try {
        await fingerprintEngine.initialize();
      } catch {
        // already initialized or fallback
      }
    }

    const fingerprint = options?.fingerprint ?? fingerprintEngine.generateFingerprint();

    const profile: Profile = {
      id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name,
      notes: options?.notes ?? '',
      tags: options?.tags ?? [],
      group: options?.group ?? null,
      owner: options?.owner ?? null,
      runtime: options?.runtime ?? 'auto',
      proxy: options?.proxy ?? null,
      fingerprint,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      totalSessions: 0,
    };

    await this.saveProfile(profile);
    this.profiles.set(id, profile);
    logger.info('Profile created', { id, name });
    return profile;
  }

  /** Update profile fields */
  async updateProfile(id: string, partial: Partial<Omit<Profile, 'id' | 'createdAt' | 'schemaVersion'>>): Promise<Profile> {
    const existing = this.profiles.get(id);
    if (!existing) throw new Error(`Profile not found: ${id}`);

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

  /** Delete profile directory and extension dir */
  async deleteProfile(id: string): Promise<void> {
    if (!this.profiles.has(id)) throw new Error(`Profile not found: ${id}`);

    const profileDir = sanitizePath(this.profilesDir, id);
    const extDir = sanitizePath(path.join(this.dataDir, 'extensions'), id);

    await fs.rm(profileDir, { recursive: true, force: true });
    await fs.rm(extDir, { recursive: true, force: true }).catch(() => {
      // extension dir may not exist — ignore
    });

    this.profiles.delete(id);
    logger.info('Profile deleted', { id });
  }

  /** Get a single profile by ID */
  getProfile(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  /** List all profiles */
  listProfiles(): Profile[] {
    return Array.from(this.profiles.values());
  }

  /** Search/filter profiles */
  searchProfiles(query: SearchQuery): Profile[] {
    return Array.from(this.profiles.values()).filter((p) => {
      if (query.name) {
        const q = query.name.toLowerCase();
        if (!p.name.toLowerCase().includes(q)) return false;
      }
      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some((t) => p.tags.includes(t));
        if (!hasTag) return false;
      }
      if (query.group !== undefined) {
        if (p.group !== query.group) return false;
      }
      if (query.owner !== undefined) {
        if (p.owner !== query.owner) return false;
      }
      return true;
    });
  }

  /**
   * Import a profile from an existing Chrome user data directory.
   * Detects Default/ folder, copies into profilesDir, creates profile.json.
   */
  async importProfile(srcDir: string): Promise<Profile> {
    // Verify srcDir is a real absolute path (no traversal from itself)
    const resolvedSrc = path.resolve(srcDir);
    const defaultDir = path.join(resolvedSrc, 'Default');
    let hasDefault = false;
    try {
      await fs.access(defaultDir);
      hasDefault = true;
    } catch {
      hasDefault = false;
    }

    const id = uuidv4();
    const destDir = sanitizePath(this.profilesDir, id);
    await fs.mkdir(destDir, { recursive: true });

    if (hasDefault) {
      await this.copyDir(defaultDir, path.join(destDir, 'Default'));
    }

    const name = path.basename(resolvedSrc);
    const now = new Date().toISOString();

    try {
      await fingerprintEngine.initialize();
    } catch {
      // ignore
    }

    const profile: Profile = {
      id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name,
      notes: '',
      tags: [],
      group: null,
      owner: null,
      runtime: 'auto',
      proxy: null,
      fingerprint: fingerprintEngine.generateFingerprint(),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      totalSessions: 0,
    };

    await this.saveProfile(profile);
    this.profiles.set(id, profile);
    logger.info('Profile imported', { id, srcDir });
    return profile;
  }

  /**
   * Export a profile as a .zip file containing profile.json + Default/
   */
  async exportProfile(id: string, destPath: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);

    const profileDir = sanitizePath(this.profilesDir, id);
    // destPath is always generated by server code (tmpdir or data/), not user input — no traversal risk

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      // Add profile.json
      archive.append(JSON.stringify(profile, null, 2), { name: 'profile.json' });

      // Add Default/ directory if it exists
      const defaultDir = path.join(profileDir, 'Default');
      archive.directory(defaultDir, 'Default');

      archive.finalize().catch(reject);
    });

    logger.info('Profile exported', { id, destPath });
  }

  /** Update lastUsedAt and increment totalSessions */
  async updateLastUsed(id: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);

    const updated: Profile = {
      ...profile,
      lastUsedAt: new Date().toISOString(),
      totalSessions: profile.totalSessions + 1,
      updatedAt: new Date().toISOString(),
    };

    await this.saveProfile(updated);
    this.profiles.set(id, updated);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async saveProfile(profile: Profile): Promise<void> {
    const profileDir = sanitizePath(this.profilesDir, profile.id);
    await fs.mkdir(profileDir, { recursive: true });
    const profilePath = path.join(profileDir, 'profile.json');
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export const profileManager = new ProfileManager();
