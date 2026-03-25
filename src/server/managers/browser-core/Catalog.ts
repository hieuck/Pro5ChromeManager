export interface BrowserCoreCatalogEntry {
  key: string;
  label: string;
  channel: string;
  platform: string;
  version: string | null;
  status: 'planned' | 'package-ready';
  artifactUrl: string | null;
  notes: string;
}

/**
 * Manages the catalog of available browser core packages.
 */
export class BrowserCoreCatalog {
  getBuiltinEntries(): BrowserCoreCatalogEntry[] {
    return [
      {
        key: 'pro5-chromium',
        label: 'Pro5 Chromium',
        channel: 'preview',
        platform: 'win32',
        version: process.env['PRO5_BROWSER_CORE_VERSION'] ?? null,
        status: process.env['PRO5_BROWSER_CORE_URL'] ? 'package-ready' : 'planned',
        artifactUrl: process.env['PRO5_BROWSER_CORE_URL'] ?? null,
        notes: process.env['PRO5_BROWSER_CORE_URL']
          ? 'Managed package is available for installation.'
          : 'Fork runtime pipeline is scaffolded but no downloadable artifact has been published yet.',
      },
    ];
  }

  validateArtifactUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid browser core artifact URL: ${url}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported browser core artifact protocol: ${parsed.protocol}`);
    }

    return parsed.toString();
  }
}

export const browserCoreCatalog = new BrowserCoreCatalog();
