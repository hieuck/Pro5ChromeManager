import path from 'path';

const LEGACY_DATA_PREFIX = /^\.?[\/\\]?data(?:[\/\\]|$)/i;

export function getDataDir(): string {
  const configured = process.env['DATA_DIR'];
  return configured ? path.resolve(configured) : path.resolve('data');
}

export function dataPath(...segments: string[]): string {
  return path.join(getDataDir(), ...segments);
}

export function resolveAppPath(targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  const normalized = targetPath.replace(LEGACY_DATA_PREFIX, '');
  const relative = normalized.replace(/^[\/\\]+/, '');
  return dataPath(relative);
}
