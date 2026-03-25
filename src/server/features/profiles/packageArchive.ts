import { execFile } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import archiver from 'archiver';
import { promisify } from 'util';
import type { Profile } from '../../shared/types';

const extractArchive = promisify(execFile);

export async function extractWindowsZipArchive(packagePath: string, destination: string): Promise<void> {
  await extractArchive('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -LiteralPath '${packagePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
  ]);
}

export async function createProfileArchive(input: {
  profile: Profile;
  profileDir: string;
  destPath: string;
}): Promise<void> {
  const { profile, profileDir, destPath } = input;
  const cookiesPath = `${profileDir}\\cookies.json`;
  const includeCookies = await fs.access(cookiesPath).then(() => true).catch(() => false);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(JSON.stringify(profile, null, 2), { name: 'profile.json' });
    archive.directory(`${profileDir}\\Default`, 'Default');

    if (includeCookies) {
      archive.file(cookiesPath, { name: 'cookies.json' });
    }

    archive.finalize().catch(reject);
  });
}
