import path from 'path';
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

  const normalizedExecutablePath = path.normalize(manifest.executableRelativePath.trim());
  if (path.isAbsolute(normalizedExecutablePath)) {
    throw new Error('Invalid browser core package: executableRelativePath must be relative');
  }
  if (normalizedExecutablePath.startsWith('..') || normalizedExecutablePath.includes(`..${path.sep}`)) {
    throw new Error('Invalid browser core package: executableRelativePath must not traverse parent directories');
  }
}
