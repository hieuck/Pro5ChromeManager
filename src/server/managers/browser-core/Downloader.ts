import fs from 'fs/promises';
import { logger } from '../../utils/logger';

/**
 * Handles network operations for downloading browser core packages.
 */
export class BrowserCoreDownloader {
  async download(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download browser core package: ${response.status} ${response.statusText}`);
    }
    const payload = Buffer.from(await response.arrayBuffer());
    if (payload.byteLength === 0) {
      throw new Error('Downloaded browser core package is empty');
    }
    await fs.writeFile(destPath, payload);
    logger.debug('Browser core package downloaded', { url, destPath, size: payload.byteLength });
  }
}

export const browserCoreDownloader = new BrowserCoreDownloader();
