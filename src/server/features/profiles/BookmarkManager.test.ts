import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BookmarkManager, buildChromeBookmarksDocument, normalizeBookmark } from './BookmarkManager';

describe('BookmarkManager', () => {
  it('normalizes bookmarks and folder names', () => {
    expect(normalizeBookmark({
      name: ' Google ',
      url: 'https://www.google.com',
      folder: ' Daily ',
    })).toEqual({
      name: 'Google',
      url: 'https://www.google.com/',
      folder: 'Daily',
    });
  });

  it('builds a bookmark bar document with folders and root links', () => {
    const document = buildChromeBookmarksDocument([
      { name: 'Google', url: 'https://www.google.com/', folder: 'Daily' },
      { name: 'Docs', url: 'https://docs.example.com/', folder: null },
    ]) as {
      roots: {
        bookmark_bar: {
          children: Array<{ type: string; name: string; children?: unknown[]; url?: string }>;
        };
      };
    };

    expect(document.roots.bookmark_bar.children.some((child) => child.type === 'folder' && child.name === 'Daily')).toBe(true);
    expect(document.roots.bookmark_bar.children.some((child) => child.type === 'url' && child.name === 'Docs')).toBe(true);
  });

  it('syncs and reads bookmarks from a Chrome profile directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-bookmarks-'));
    const manager = new BookmarkManager();

    await manager.syncBookmarks(tmpDir, [
      { name: 'Google', url: 'https://www.google.com', folder: 'Daily' },
      { name: 'Docs', url: 'https://docs.example.com', folder: null },
    ]);

    const bookmarksPath = path.join(tmpDir, 'Default', 'Bookmarks');
    await expect(fs.access(bookmarksPath)).resolves.toBeUndefined();
    await expect(manager.readBookmarks(tmpDir)).resolves.toEqual([
      { name: 'Docs', url: 'https://docs.example.com/', folder: null },
      { name: 'Google', url: 'https://www.google.com/', folder: 'Daily' },
    ]);
  });
});
