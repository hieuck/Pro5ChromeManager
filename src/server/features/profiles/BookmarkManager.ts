import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { ValidationError } from '../../core/errors';

export interface BookmarkEntry {
  name: string;
  url: string;
  folder?: string | null;
}

interface RawBookmarkEntry {
  name?: unknown;
  url?: unknown;
  folder?: unknown;
}

interface ChromeBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

function chromeTimestamp(): string {
  const epochDeltaMs = Date.UTC(1970, 0, 1) - Date.UTC(1601, 0, 1);
  return String((Date.now() + Math.abs(epochDeltaMs)) * 1000);
}

export function normalizeBookmark(input: RawBookmarkEntry): BookmarkEntry {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const folder = typeof input.folder === 'string' && input.folder.trim() ? input.folder.trim() : null;

  if (!name) {
    throw new ValidationError('Bookmark name is required', { field: 'name' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ValidationError(`Bookmark URL is invalid for ${name}`, { field: 'url', value: url });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new ValidationError(`Bookmark URL must use http or https for ${name}`, { field: 'url', value: url });
  }

  return { name, url: parsedUrl.toString(), folder };
}

export function buildChromeBookmarksDocument(bookmarks: BookmarkEntry[]): Record<string, unknown> {
  const folders = new Map<string, ChromeBookmarkNode[]>();
  const rootChildren: ChromeBookmarkNode[] = [];

  for (const bookmark of bookmarks) {
    const node: ChromeBookmarkNode = {
      type: 'url',
      name: bookmark.name,
      url: bookmark.url,
    };

    if (!bookmark.folder) {
      rootChildren.push(node);
      continue;
    }

    folders.set(bookmark.folder, [...(folders.get(bookmark.folder) ?? []), node]);
  }

  for (const [folder, children] of folders.entries()) {
    rootChildren.push({
      type: 'folder',
      name: folder,
      children,
    });
  }

  return {
    checksum: '',
    version: 1,
    roots: {
      bookmark_bar: {
        children: rootChildren.map((child) => ({
          date_added: chromeTimestamp(),
          guid: randomUUID(),
          id: Math.floor(Math.random() * 1_000_000).toString(),
          ...(child.type === 'folder'
            ? {
              type: 'folder',
              name: child.name,
              date_modified: chromeTimestamp(),
              children: (child.children ?? []).map((nestedChild) => ({
                date_added: chromeTimestamp(),
                guid: randomUUID(),
                id: Math.floor(Math.random() * 1_000_000).toString(),
                type: 'url',
                name: nestedChild.name,
                url: nestedChild.url,
              })),
            }
            : {
              type: 'url',
              name: child.name,
              url: child.url,
            }),
        })),
        date_added: chromeTimestamp(),
        date_modified: chromeTimestamp(),
        guid: '00000000-0000-0000-0000-000000000001',
        id: '1',
        name: 'Bookmarks bar',
        type: 'folder',
      },
      other: {
        children: [],
        date_added: chromeTimestamp(),
        date_modified: chromeTimestamp(),
        guid: '00000000-0000-0000-0000-000000000002',
        id: '2',
        name: 'Other bookmarks',
        type: 'folder',
      },
      synced: {
        children: [],
        date_added: chromeTimestamp(),
        date_modified: chromeTimestamp(),
        guid: '00000000-0000-0000-0000-000000000003',
        id: '3',
        name: 'Mobile bookmarks',
        type: 'folder',
      },
    },
  };
}

export class BookmarkManager {
  async syncBookmarks(profileDir: string, bookmarks: RawBookmarkEntry[]): Promise<BookmarkEntry[]> {
    const normalized = bookmarks.map((bookmark) => normalizeBookmark(bookmark));
    const defaultDir = path.join(profileDir, 'Default');
    const bookmarksPath = path.join(defaultDir, 'Bookmarks');
    await fs.mkdir(defaultDir, { recursive: true });
    await fs.writeFile(bookmarksPath, JSON.stringify(buildChromeBookmarksDocument(normalized), null, 2), 'utf-8');
    return normalized;
  }

  async readBookmarks(profileDir: string): Promise<BookmarkEntry[]> {
    const bookmarksPath = path.join(profileDir, 'Default', 'Bookmarks');
    try {
      const raw = await fs.readFile(bookmarksPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        roots?: {
          bookmark_bar?: { children?: ChromeBookmarkNode[] };
        };
      };

      const children = parsed.roots?.bookmark_bar?.children ?? [];
      const flattened: BookmarkEntry[] = [];
      for (const child of children) {
        if (child.type === 'url' && child.name && child.url) {
          flattened.push(normalizeBookmark({ name: child.name, url: child.url, folder: null }));
        }
        if (child.type === 'folder' && child.name && Array.isArray(child.children)) {
          for (const nestedChild of child.children) {
            if (nestedChild.type === 'url' && nestedChild.name && nestedChild.url) {
              flattened.push(normalizeBookmark({ name: nestedChild.name, url: nestedChild.url, folder: child.name }));
            }
          }
        }
      }
      return flattened;
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : null;
      if (code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }
}

export const bookmarkManager = new BookmarkManager();
