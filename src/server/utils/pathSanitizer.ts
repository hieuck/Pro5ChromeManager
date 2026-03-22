import path from 'path';

/**
 * Resolve `userPath` relative to `baseDir` and verify it stays within `baseDir`.
 * Throws if the resolved path escapes the base directory (path traversal attempt).
 */
export function sanitizePath(baseDir: string, userPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, userPath);

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: "${userPath}" escapes base directory`);
  }

  return resolved;
}

/**
 * Verify that `filePath` is within `baseDir`.
 * Use when you already have an absolute path and just need to verify it.
 */
export function assertWithinBase(baseDir: string, filePath: string): void {
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: "${filePath}" is outside base directory`);
  }
}
