import { z } from 'zod';
import { extensionManager } from '../../managers/ExtensionManager';
import { profileManager } from './ProfileManager';
import { proxyManager } from '../../managers/ProxyManager';
import { BulkUpdateProfilesSchema, CloneProfileSchema, UpdateProfileSchema } from './contracts';

function normalizeBookmarks<T extends { folder?: string | null }>(bookmarks: T[]): Array<T & { folder: string | null }> {
  return bookmarks.map((bookmark) => ({
    ...bookmark,
    folder: bookmark.folder ?? null,
  }));
}

export function resolveProxySelection(proxyId?: string | null) {
  if (proxyId === undefined) {
    return undefined;
  }
  if (proxyId === null) {
    return null;
  }

  const proxy = proxyManager.getProxy(proxyId);
  if (!proxy) {
    throw new Error(`Proxy not found: ${proxyId}`);
  }

  return { ...proxy };
}

export function resolveExtensionSelection(extensionIds?: string[], extensionCategories?: string[]): string[] | undefined {
  if (extensionIds === undefined && extensionCategories === undefined) {
    return undefined;
  }

  return extensionManager.resolveExtensionSelection(extensionIds, extensionCategories);
}

export function buildProfileUpdateFields(
  body: z.infer<typeof UpdateProfileSchema>,
): Parameters<typeof profileManager.updateProfile>[1] {
  const resolvedExtensionIds = resolveExtensionSelection(body.extensionIds, body.extensionCategories);

  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    ...(body.group !== undefined ? { group: body.group } : {}),
    ...(body.owner !== undefined ? { owner: body.owner } : {}),
    ...(body.runtime !== undefined ? { runtime: body.runtime } : {}),
    ...(body.bookmarks !== undefined ? { bookmarks: normalizeBookmarks(body.bookmarks) } : {}),
    ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
    ...(body.fingerprint !== undefined
      ? { fingerprint: body.fingerprint as Parameters<typeof profileManager.updateProfile>[1]['fingerprint'] }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'proxyId')
      ? { proxy: resolveProxySelection(body.proxyId) }
      : {}),
  };
}

export function buildCloneProfileFields(
  body: z.infer<typeof CloneProfileSchema>,
): Parameters<typeof profileManager.cloneProfile>[1] {
  const resolvedExtensionIds = resolveExtensionSelection(body.extensionIds, body.extensionCategories);

  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    ...(body.group !== undefined ? { group: body.group } : {}),
    ...(body.owner !== undefined ? { owner: body.owner } : {}),
    ...(body.runtime !== undefined ? { runtime: body.runtime } : {}),
    ...(body.bookmarks !== undefined ? { bookmarks: normalizeBookmarks(body.bookmarks) } : {}),
    ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
  };
}

export function buildCreateProfileFields(input: {
  notes?: string;
  tags?: string[];
  group?: string | null;
  owner?: string | null;
  runtime?: string;
  proxyId?: string | null;
  extensionIds?: string[];
  extensionCategories?: string[];
  bookmarks?: Array<{ name: string; url: string; folder?: string | null }>;
}) {
  const resolvedExtensionIds = resolveExtensionSelection(input.extensionIds, input.extensionCategories);

  return {
    notes: input.notes,
    tags: input.tags,
    group: input.group ?? null,
    owner: input.owner ?? null,
    runtime: input.runtime,
    proxy: resolveProxySelection(input.proxyId) ?? null,
    ...(input.bookmarks !== undefined ? { bookmarks: normalizeBookmarks(input.bookmarks) } : {}),
    ...(resolvedExtensionIds !== undefined ? { extensionIds: resolvedExtensionIds } : {}),
  };
}

export function mergeProfileTags(
  currentTags: string[],
  updates: z.infer<typeof BulkUpdateProfilesSchema>['updates'],
): string[] {
  if (updates.setTags) {
    return Array.from(new Set(updates.setTags.map((tag) => tag.trim()).filter(Boolean)));
  }

  const nextTags = new Set(currentTags);
  for (const tag of updates.addTags ?? []) {
    const normalized = tag.trim();
    if (normalized) {
      nextTags.add(normalized);
    }
  }
  for (const tag of updates.removeTags ?? []) {
    nextTags.delete(tag.trim());
  }

  return Array.from(nextTags);
}
