import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import type { ManagedExtension } from '../../shared/types';

function normalizeManagedExtension(extension: ManagedExtension): ManagedExtension {
  return {
    ...extension,
    category: extension.category ?? null,
    defaultForNewProfiles: extension.defaultForNewProfiles ?? false,
  };
}

export async function loadManagedExtensions(extensionsPath: string): Promise<ManagedExtension[]> {
  try {
    const raw = await fs.readFile(extensionsPath, 'utf-8');
    const parsed = JSON.parse(raw) as ManagedExtension[];
    return parsed.map(normalizeManagedExtension);
  } catch (error) {
    const isNotFound = error instanceof Error && 'code' in (error as NodeJS.ErrnoException)
      && (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isNotFound) {
      logger.warn('ExtensionManager: failed to load extensions.json', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return [];
  }
}

export async function persistManagedExtensions(
  extensionsPath: string,
  extensions: ManagedExtension[],
): Promise<void> {
  await fs.mkdir(path.dirname(extensionsPath), { recursive: true });
  await fs.writeFile(extensionsPath, JSON.stringify(extensions, null, 2), 'utf-8');
}
