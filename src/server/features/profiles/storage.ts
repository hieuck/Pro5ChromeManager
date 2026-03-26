import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../core/logging/logger';
import { bookmarkManager } from './BookmarkManager';
import { sanitizePath } from '../../core/fs/pathSanitizer';
import type { Profile } from '../../../shared/contracts';
import { CURRENT_SCHEMA_VERSION, migrateProfile, repairProfile } from './migration';

export async function saveProfileRecord(input: {
  profilesDir: string;
  profileDirMap: Map<string, string>;
  profile: Profile;
}): Promise<void> {
  const { profilesDir, profileDirMap, profile } = input;
  const dirName = profileDirMap.get(profile.id) ?? profile.id;
  const profileDir = path.join(profilesDir, dirName);
  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(path.join(profileDir, 'profile.json'), JSON.stringify(profile, null, 2), 'utf-8');
  await bookmarkManager.syncBookmarks(profileDir, profile.bookmarks ?? []);
}

export async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function loadProfilesFromDirectory(profilesDir: string): Promise<{
  profiles: Map<string, Profile>;
  profileDirMap: Map<string, string>;
}> {
  await fs.mkdir(profilesDir, { recursive: true });

  const profiles = new Map<string, Profile>();
  const profileDirMap = new Map<string, string>();

  let entries: string[] = [];
  try {
    entries = await fs.readdir(profilesDir);
  } catch {
    logger.warn('ProfileManager: could not read profilesDir', { dir: profilesDir });
    return { profiles, profileDirMap };
  }

  for (const entry of entries) {
    const profileJsonPath = path.join(profilesDir, entry, 'profile.json');
    try {
      const raw = await fs.readFile(profileJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const rawVersion = typeof parsed['schemaVersion'] === 'number' ? parsed['schemaVersion'] : 0;
      const migrated = migrateProfile(parsed, CURRENT_SCHEMA_VERSION) as unknown as Profile;

      const { profile, needsSave: repairNeedsSave } = await repairProfile(migrated);
      let needsSave = rawVersion < CURRENT_SCHEMA_VERSION || repairNeedsSave;

      const rawProxy = parsed['proxy'];
      if (rawProxy !== null && typeof rawProxy === 'object' && 'server' in (rawProxy as object) && !('id' in (rawProxy as object))) {
        needsSave = true;
      }

      profileDirMap.set(profile.id, entry);

      if (entry !== profile.id) {
        const oldDir = sanitizePath(profilesDir, entry);
        const newDir = sanitizePath(profilesDir, profile.id);
        try {
          await fs.rename(oldDir, newDir);
          profileDirMap.set(profile.id, profile.id);
          needsSave = true;
          logger.info('ProfileManager: migrated legacy dir name to UUID', { from: entry, to: profile.id });
        } catch (renameError) {
          logger.warn('ProfileManager: could not rename legacy dir', {
            from: entry,
            to: profile.id,
            error: renameError instanceof Error ? renameError.message : String(renameError),
          });
        }
      }

      profiles.set(profile.id, profile);

      if (needsSave) {
        await saveProfileRecord({ profilesDir, profileDirMap, profile }).catch((saveError) => {
          logger.warn('ProfileManager: could not persist repaired profile', {
            id: profile.id,
            error: saveError instanceof Error ? saveError.message : String(saveError),
          });
        });
      }
    } catch (error) {
      logger.warn('ProfileManager: failed to load profile', {
        entry,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { profiles, profileDirMap };
}
