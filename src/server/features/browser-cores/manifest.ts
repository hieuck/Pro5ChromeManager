import type { BrowserCoreManifest } from './BrowserCoreManager';

export function validateBrowserCoreManifest(manifest: BrowserCoreManifest): void {
  if (!manifest.key?.trim()) {
    throw new Error('Invalid browser core package: missing key');
  }

  if (!manifest.label?.trim()) {
    throw new Error('Invalid browser core package: missing label');
  }

  if (!manifest.version?.trim()) {
    throw new Error('Invalid browser core package: missing version');
  }

  if (!manifest.executableRelativePath?.trim()) {
    throw new Error('Invalid browser core package: missing executableRelativePath');
  }
}
