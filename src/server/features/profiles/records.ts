import type { Profile } from '../../../shared/contracts';
import type { BookmarkEntry } from './BookmarkManager';
import { CURRENT_SCHEMA_VERSION } from './migration';

type MutableProfileFields = Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>>;
type CloneOverrides = Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion' | 'lastUsedAt' | 'totalSessions'>>;

export function buildCreatedProfile(input: {
  id: string;
  name: string;
  now: string;
  fingerprint: Profile['fingerprint'];
  extensionIds: string[];
  options?: MutableProfileFields;
}): Profile {
  const { id, name, now, fingerprint, extensionIds, options } = input;

  return {
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    notes: options?.notes ?? '',
    tags: options?.tags ?? [],
    group: options?.group ?? null,
    owner: options?.owner ?? null,
    runtime: options?.runtime ?? 'auto',
    proxy: options?.proxy ?? null,
    extensionIds,
    bookmarks: options?.bookmarks ?? [],
    fingerprint,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    totalSessions: 0,
  };
}

export function buildClonedProfile(input: {
  cloneId: string;
  now: string;
  existing: Profile;
  overrides?: CloneOverrides;
}): Profile {
  const { cloneId, now, existing, overrides } = input;

  return {
    ...JSON.parse(JSON.stringify(existing)) as Profile,
    ...overrides,
    id: cloneId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: overrides?.name?.trim() || `${existing.name} Copy`,
    tags: overrides?.tags ?? [...existing.tags],
    extensionIds: overrides?.extensionIds ?? [...existing.extensionIds],
    bookmarks: overrides?.bookmarks ?? [...existing.bookmarks],
    fingerprint: overrides?.fingerprint ?? JSON.parse(JSON.stringify(existing.fingerprint)),
    proxy: overrides?.proxy ? { ...overrides.proxy } : existing.proxy ? { ...existing.proxy } : null,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    totalSessions: 0,
  };
}

export function buildImportedProfile(input: {
  id: string;
  name: string;
  now: string;
  bookmarks: BookmarkEntry[];
  fingerprint: Profile['fingerprint'];
}): Profile {
  const { id, name, now, bookmarks, fingerprint } = input;

  return {
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    notes: '',
    tags: [],
    group: null,
    owner: null,
    runtime: 'auto',
    proxy: null,
    extensionIds: [],
    bookmarks,
    fingerprint,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    totalSessions: 0,
  };
}

export function buildImportedPackageProfile(input: {
  importedId: string;
  now: string;
  migratedProfile: Profile;
  importedBookmarks: BookmarkEntry[];
  fallbackFingerprint: Profile['fingerprint'];
}): Profile {
  const { importedId, now, migratedProfile, importedBookmarks, fallbackFingerprint } = input;

  return {
    ...migratedProfile,
    id: importedId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: migratedProfile.name?.trim() || `Imported ${importedId.slice(0, 8)}`,
    notes: migratedProfile.notes ?? '',
    tags: migratedProfile.tags ?? [],
    group: migratedProfile.group ?? null,
    owner: migratedProfile.owner ?? null,
    runtime: migratedProfile.runtime ?? 'auto',
    proxy: migratedProfile.proxy ?? null,
    extensionIds: migratedProfile.extensionIds ?? [],
    bookmarks: importedBookmarks,
    fingerprint: migratedProfile.fingerprint ?? fallbackFingerprint,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    totalSessions: 0,
  };
}
