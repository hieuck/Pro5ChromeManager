import { z } from 'zod';

const BookmarkSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  folder: z.string().nullable().optional(),
});

export const CreateProfileSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  proxyId: z.string().nullable().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(BookmarkSchema).optional(),
});

export const BulkCreateProfilesSchema = z.object({
  entries: z.array(z.object({
    name: z.string().min(1),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    group: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
  })).min(1),
  runtime: z.string().optional(),
  proxyId: z.string().nullable().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(BookmarkSchema).optional(),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  proxyId: z.string().nullable().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(BookmarkSchema).optional(),
  fingerprint: z.unknown().optional(),
});

export const BulkUpdateProfilesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  updates: z.object({
    group: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    runtime: z.string().optional(),
    addTags: z.array(z.string()).optional(),
    removeTags: z.array(z.string()).optional(),
    setTags: z.array(z.string()).optional(),
  }).refine((value) => (
    value.group !== undefined
    || value.owner !== undefined
    || value.runtime !== undefined
    || value.addTags !== undefined
    || value.removeTags !== undefined
    || value.setTags !== undefined
  ), {
    message: 'At least one bulk update field is required',
  }).refine((value) => !(value.setTags && (value.addTags || value.removeTags)), {
    message: 'setTags cannot be combined with addTags or removeTags',
  }),
});

export const SearchSchema = z.object({
  name: z.string().optional(),
  tags: z.string().optional(),
  group: z.string().optional(),
  owner: z.string().optional(),
});

export const CloneProfileSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  runtime: z.string().optional(),
  extensionIds: z.array(z.string()).optional(),
  extensionCategories: z.array(z.string()).optional(),
  bookmarks: z.array(BookmarkSchema).optional(),
});

export const CookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().min(1),
  path: z.string().optional(),
  expires: z.number().nullable().optional(),
  expirationDate: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.string().optional(),
});

export const ImportCookiesSchema = z.object({
  cookies: z.array(CookieSchema).min(1),
});

export const ImportProfileSchema = z.object({
  srcDir: z.string().min(1),
});

export const BulkImportProfilesSchema = z.object({
  srcDirs: z.array(z.string().min(1)).min(1),
});
