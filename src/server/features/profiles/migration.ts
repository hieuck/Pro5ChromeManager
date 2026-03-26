import type { Profile } from '../../../shared/contracts';
import { logger } from '../../core/logging/logger';
import { fingerprintEngine } from '../../managers/FingerprintEngine';

export const CURRENT_SCHEMA_VERSION = 1;

export function migrateProfile(raw: Record<string, unknown>, targetVersion: number): Record<string, unknown> {
  let profile = { ...raw };
  const version = typeof profile['schemaVersion'] === 'number' ? profile['schemaVersion'] : 0;

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

  if (!profile['name'] || typeof profile['name'] !== 'string') {
    const id = typeof profile['id'] === 'string' ? profile['id'] : 'unknown';
    profile['name'] = `Profile ${id.slice(0, 8)}`;
  }

  if (!Array.isArray(profile['tags'])) {
    profile['tags'] = [];
  }

  if (!Array.isArray(profile['extensionIds'])) {
    profile['extensionIds'] = [];
  }

  if (!Array.isArray(profile['bookmarks'])) {
    profile['bookmarks'] = [];
  }

  const proxy = profile['proxy'];
  if (proxy !== null && typeof proxy === 'object') {
    const candidate = proxy as Record<string, unknown>;
    const isLegacyFormat = 'server' in candidate && !('id' in candidate);
    if (isLegacyFormat) {
      profile['proxy'] = null;
    }
  }

  return profile;
}

export async function repairProfile(profile: Profile): Promise<{ profile: Profile; needsSave: boolean }> {
  let needsSave = false;

  if (profile.totalSessions === null || profile.totalSessions === undefined) {
    profile.totalSessions = 0;
    needsSave = true;
  }

  if (!profile.fingerprint || typeof profile.fingerprint !== 'object') {
    try {
      await fingerprintEngine.initialize();
    } catch {
      // already initialized or fallback path is available
    }
    profile.fingerprint = fingerprintEngine.generateFingerprint();
    needsSave = true;
    logger.info('ProfileMigration: generated missing fingerprint', { id: profile.id });
  }

  return { profile, needsSave };
}
