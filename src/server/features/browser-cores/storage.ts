import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../core/logging/logger';
import type { InstalledBrowserCore } from './BrowserCoreManager';

export async function loadInstalledBrowserCores(storagePath: string): Promise<InstalledBrowserCore[]> {
  try {
    const raw = await fs.readFile(storagePath, 'utf-8');
    return JSON.parse(raw) as InstalledBrowserCore[];
  } catch (error) {
    const code = error instanceof Error && 'code' in (error as NodeJS.ErrnoException)
      ? (error as NodeJS.ErrnoException).code
      : null;
    if (code !== 'ENOENT') {
      logger.warn('BrowserCoreManager: failed to load browser-cores.json', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return [];
  }
}

export async function persistInstalledBrowserCores(
  storagePath: string,
  cores: InstalledBrowserCore[],
): Promise<void> {
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, JSON.stringify(cores, null, 2), 'utf-8');
}
