import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Handles browser core package extraction.
 */
export class BrowserCoreExtractor {
  async expandArchive(packagePath: string, destinationDir: string): Promise<void> {
    if (process.platform === 'win32') {
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${packagePath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
        ],
        { windowsHide: true },
      );
    } else {
      await execFileAsync('unzip', ['-o', packagePath, '-d', destinationDir]);
    }
  }
}

export const browserCoreExtractor = new BrowserCoreExtractor();
