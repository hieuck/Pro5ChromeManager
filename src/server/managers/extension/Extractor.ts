import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const extractZip = promisify(execFile);

interface ManifestShape {
  name?: string;
  version?: string;
  description?: string;
}

/**
 * Handles ZIP/CRX extraction and manifest.json inspection.
 */
export class Extractor {
  async extractPackageAndResolveEntryPath(sourcePath: string, managedRoot: string): Promise<string> {
    const extension = path.extname(sourcePath).toLowerCase();
    if (!['.zip', '.crx'].includes(extension)) {
      throw new Error(`Unsupported extension package: ${sourcePath}`);
    }
    if (process.platform !== 'win32') {
      throw new Error('ZIP/CRX extension import is currently supported on Windows only');
    }

    const archivePath = path.join(managedRoot, extension === '.crx' ? '__package.zip' : path.basename(sourcePath));
    await fs.rm(managedRoot, { recursive: true, force: true });
    await fs.mkdir(managedRoot, { recursive: true });

    try {
      if (extension === '.crx') {
        await this.convertCrxToZip(sourcePath, archivePath);
      }
      await extractZip('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${(extension === '.crx' ? archivePath : sourcePath).replace(/'/g, "''")}' -DestinationPath '${managedRoot.replace(/'/g, "''")}' -Force`,
      ]);
      if (extension === '.crx') {
        await fs.rm(archivePath, { force: true }).catch(() => undefined);
      }
      return await this.resolveExtensionEntryPath(managedRoot);
    } catch (err) {
      await fs.rm(managedRoot, { recursive: true, force: true }).catch(() => undefined);
      throw new Error(`Failed to extract extension package: ${sourcePath}`);
    }
  }

  async resolveExtensionEntryPath(rootPath: string): Promise<string> {
    const directManifest = await fs.access(path.join(rootPath, 'manifest.json')).then(() => true).catch(() => false);
    if (directManifest) {
      return rootPath;
    }

    const firstLevelEntries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => []);
    for (const entry of firstLevelEntries) {
      if (!entry.isDirectory()) continue;

      const nestedPath = path.join(rootPath, entry.name);
      const nestedManifest = await fs.access(path.join(nestedPath, 'manifest.json')).then(() => true).catch(() => false);
      if (nestedManifest) {
        return nestedPath;
      }
    }

    throw new Error(`manifest.json not found in extension: ${rootPath}`);
  }

  async inspectManifest(entryPath: string): Promise<{
    name: string;
    version: string | null;
    description: string | null;
  }> {
    const manifestPath = path.join(entryPath, 'manifest.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf-8').catch(() => null);
    if (!manifestRaw) {
      throw new Error(`manifest.json not found in extension: ${entryPath}`);
    }

    let manifest: ManifestShape;
    try {
      manifest = JSON.parse(manifestRaw) as ManifestShape;
    } catch {
      throw new Error(`Invalid manifest.json: ${manifestPath}`);
    }

    return {
      name: manifest.name?.trim() || path.basename(entryPath),
      version: manifest.version?.trim() || null,
      description: manifest.description?.trim() || null,
    };
  }

  private async convertCrxToZip(sourcePath: string, zipPath: string): Promise<void> {
    const crxBuffer = await fs.readFile(sourcePath);
    const zipStart = crxBuffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (zipStart < 0) {
      throw new Error(`Invalid CRX package: ${sourcePath}`);
    }

    await fs.writeFile(zipPath, crxBuffer.subarray(zipStart));
  }
}

export const extractor = new Extractor();
