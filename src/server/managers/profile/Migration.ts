import { Profile } from '../../shared/types';
import { logger } from '../../utils/logger';
import { fingerprintEngine } from '../FingerprintEngine';

export const CURRENT_SCHEMA_VERSION = 1;

/** Migrate profile data to the latest version and perform data repair */
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
      extensionIds: [],
      bookmarks: [],
      lastUsedAt: null,
      totalSessions: 0,
      ...profile,
    };
    profile['schemaVersion'] = 1;
  }

  // Data repair: ensure name is always a non-empty string
  if (!profile['name'] || typeof profile['name'] !== 'string') {
    const id = typeof profile['id'] === 'string' ? profile['id'] : 'unknown';
    profile['name'] = `Profile ${id.slice(0, 8)}`;
  }

  // Data repair: ensure tags is always an array
  if (!Array.isArray(profile['tags'])) {
    profile['tags'] = [];
  }

  if (!Array.isArray(profile['extensionIds'])) {
    profile['extensionIds'] = [];
  }

  if (!Array.isArray(profile['bookmarks'])) {
    profile['bookmarks'] = [];
  }

  // Data repair: normalize legacy proxy format
  const proxy = profile['proxy'];
  if (proxy !== null && typeof proxy === 'object') {
    const p = proxy as Record<string, unknown>;
    const isLegacyFormat = 'server' in p && !('id' in p);
    if (isLegacyFormat) {
      profile['proxy'] = null;
    }
  }

  return profile;
}

/** Specialized utility to ensure a profile is fully repaired and ready for use */
export async function repairProfile(profile: Profile): Promise<{ profile: Profile; needsSave: boolean }> {
  let needsSave = false;

  // Fix totalSessions
  if (profile.totalSessions === null || profile.totalSessions === undefined) {
    profile.totalSessions = 0;
    needsSave = true;
  }

  // Generate fingerprint if missing
  if (!profile.fingerprint || typeof profile.fingerprint !== 'object') {
    try {
      await fingerprintEngine.initialize();
    } catch { /* ignore */ }
    profile.fingerprint = fingerprintEngine.generateFingerprint();
    needsSave = true;
    logger.info('ProfileMigration: generated missing fingerprint', { id: profile.id });
  }

  return { profile, needsSave };
}
