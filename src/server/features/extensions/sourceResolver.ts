import { resolveAppPath } from '../../core/fs/dataPaths';

export interface ResolvedSourceInput {
  kind: 'path' | 'chrome_web_store';
  originalSourcePath: string;
  normalizedSourcePath: string;
  key: string;
  extensionId?: string;
}

const CHROME_WEB_STORE_ID_PATTERN = /^[a-p]{32}$/i;

/**
 * Handles detection and normalization of extension source inputs (Path, URL, or ID).
 */
export class SourceResolver {
  resolve(sourcePath: string): ResolvedSourceInput {
    const trimmed = sourcePath.trim();
    const chromeWebStoreId = this.extractChromeWebStoreId(trimmed);

    if (chromeWebStoreId) {
      return {
        kind: 'chrome_web_store',
        originalSourcePath: trimmed,
        normalizedSourcePath: trimmed,
        key: `chrome-web-store:${chromeWebStoreId}`,
        extensionId: chromeWebStoreId,
      };
    }

    const normalizedPath = resolveAppPath(trimmed);
    return {
      kind: 'path',
      originalSourcePath: trimmed,
      normalizedSourcePath: normalizedPath,
      key: `path:${normalizedPath.toLowerCase()}`,
    };
  }

  private extractChromeWebStoreId(sourcePath: string): string | null {
    const normalized = sourcePath.trim();
    if (CHROME_WEB_STORE_ID_PATTERN.test(normalized)) {
      return normalized.toLowerCase();
    }

    try {
      const url = new URL(normalized);
      const hostname = url.hostname.toLowerCase();
      const isChromeWebStoreHost = hostname === 'chromewebstore.google.com' || hostname === 'chrome.google.com';
      if (!isChromeWebStoreHost) {
        return null;
      }

      const segments = url.pathname.split('/').filter(Boolean);
      const detailIndex = segments.findIndex((segment) => segment === 'detail');
      if (detailIndex >= 0 && segments[detailIndex + 2] && CHROME_WEB_STORE_ID_PATTERN.test(segments[detailIndex + 2])) {
        return segments[detailIndex + 2].toLowerCase();
      }

      const tail = segments.at(-1);
      return tail && CHROME_WEB_STORE_ID_PATTERN.test(tail) ? tail.toLowerCase() : null;
    } catch {
      return null;
    }
  }
}

export const sourceResolver = new SourceResolver();
