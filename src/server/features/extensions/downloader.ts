import fs from 'fs/promises';
import { logger } from '../../core/logging/logger';

const DEFAULT_CWS_DOWNLOAD_URL_TEMPLATE = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion={prodversion}&acceptformat=crx3&x=id%3D{id}%26uc';

/**
 * Handles downloading extension packages from the Chrome Web Store.
 */
export class Downloader {
  async downloadChromeWebStorePackage(chromeWebStoreId: string, destinationPath: string): Promise<void> {
    const response = await fetch(this.buildDownloadUrl(chromeWebStoreId), {
      redirect: 'follow',
      headers: {
        'User-Agent': `Pro5ChromeManager/${process.env['npm_package_version'] ?? '1.0.0'}`,
      },
    }).catch((err) => {
      throw new Error(`Failed to download Chrome Web Store package: ${err instanceof Error ? err.message : String(err)}`);
    });

    if (!response.ok) {
      throw new Error(`Chrome Web Store returned ${response.status} while downloading ${chromeWebStoreId}`);
    }

    const archiveBytes = Buffer.from(await response.arrayBuffer());
    if (archiveBytes.length === 0) {
      throw new Error(`Chrome Web Store package is empty: ${chromeWebStoreId}`);
    }

    await fs.writeFile(destinationPath, archiveBytes);
  }

  private buildDownloadUrl(chromeWebStoreId: string): string {
    const template = process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] ?? DEFAULT_CWS_DOWNLOAD_URL_TEMPLATE;
    const prodversion = process.env['PRO5_EXTENSION_STORE_PRODVERSION'] ?? '131.0.0.0';
    return template
      .replaceAll('{id}', encodeURIComponent(chromeWebStoreId))
      .replaceAll('{prodversion}', encodeURIComponent(prodversion));
  }
}

export const downloader = new Downloader();
