import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { logger } from '../../core/logging/logger';
import { configManager } from '../config/ConfigManager';
import { dataPath, resolveAppPath } from '../../core/fs/dataPaths';
import { BackupEntry } from '../../../shared/contracts';
import { ValidationError } from '../../core/errors';

const BACKUPS_DIR = dataPath('backups');
const MAX_BACKUPS = 7;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const BACKUP_INTERVAL_MS =
  HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const ZIP_ARCHIVE_FORMAT = 'zip';
const ZIP_COMPRESSION_LEVEL = 6;
const BACKUP_FILE_PREFIX = 'backup-';
const ZIP_EXTENSION = '.zip';
const CONFIG_FILENAME = 'config.json';
const PROXIES_FILENAME = 'proxies.json';
const PROFILE_METADATA_GLOB = '*/profile.json';
const PROFILES_ARCHIVE_PREFIX = 'profiles';
const RESTORE_TEMP_DIR_PREFIX = 'restore-tmp-';
const WINDOWS_PLATFORM = 'win32';
const POWERSHELL_BINARY = 'powershell';
const POWERSHELL_ARGS = ['-NoProfile', '-Command'] as const;
const UNZIP_BINARY = 'unzip';
const UNZIP_ARGS = ['-o'] as const;
const INVALID_BACKUP_FILENAME_MESSAGE = 'Invalid backup filename';
const AUTO_BACKUP_STARTED_MESSAGE = 'BackupManager: auto-backup started';

export class BackupManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly backupsDir: string;

  constructor(backupsDir?: string) {
    this.backupsDir = backupsDir ?? BACKUPS_DIR;
  }

  startAutoBackup(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.createBackup().catch((error) => {
        logger.error('Auto-backup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, BACKUP_INTERVAL_MS);

    logger.info(AUTO_BACKUP_STARTED_MESSAGE, { intervalMs: BACKUP_INTERVAL_MS });
  }

  stopAutoBackup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async createBackup(): Promise<BackupEntry> {
    await fs.mkdir(this.backupsDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const filenameTimestamp = timestamp.replace(/[:.]/g, '-');
    const filename = `${BACKUP_FILE_PREFIX}${filenameTimestamp}${ZIP_EXTENSION}`;
    const destinationPath = path.join(this.backupsDir, filename);
    const profilesDir = resolveAppPath(configManager.get().profilesDir);
    const configPath = dataPath(CONFIG_FILENAME);
    const proxiesPath = dataPath(PROXIES_FILENAME);
    const configExists = await fileExists(configPath);
    const proxiesExists = await fileExists(proxiesPath);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destinationPath);
      const archive = archiver(ZIP_ARCHIVE_FORMAT, {
        zlib: { level: ZIP_COMPRESSION_LEVEL },
      });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      if (configExists) {
        archive.file(configPath, { name: CONFIG_FILENAME });
      }

      if (proxiesExists) {
        archive.file(proxiesPath, { name: PROXIES_FILENAME });
      }

      archive.glob(PROFILE_METADATA_GLOB, { cwd: profilesDir }, { prefix: PROFILES_ARCHIVE_PREFIX });
      void archive.finalize();
    });

    const stat = await fs.stat(destinationPath);
    const entry: BackupEntry = { filename, timestamp, sizeBytes: stat.size };

    await this.rotateBackups();
    logger.info('Backup created', { filename, sizeBytes: stat.size });
    return entry;
  }

  async listBackups(): Promise<BackupEntry[]> {
    await fs.mkdir(this.backupsDir, { recursive: true });
    const files = await fs.readdir(this.backupsDir);
    const entries: BackupEntry[] = [];

    for (const file of files.filter((candidate) => candidate.endsWith(ZIP_EXTENSION))) {
      try {
        const stat = await fs.stat(path.join(this.backupsDir, file));
        entries.push({
          filename: file,
          timestamp: parseTimestampFromFilename(file),
          sizeBytes: stat.size,
        });
      } catch {
        // Skip corrupted entries.
      }
    }

    return entries.sort((left, right) => right.filename.localeCompare(left.filename));
  }

  async restoreBackup(filename: string): Promise<void> {
    validateBackupFilename(filename);

    const backupPath = path.join(this.backupsDir, filename);
    await fs.access(backupPath);

    const profilesDir = resolveAppPath(configManager.get().profilesDir);
    const temporaryDir = path.join(this.backupsDir, `${RESTORE_TEMP_DIR_PREFIX}${Date.now()}`);

    try {
      await fs.mkdir(temporaryDir, { recursive: true });
      await extractBackupArchive(backupPath, temporaryDir);

      const profilesTempDir = path.join(temporaryDir, PROFILES_ARCHIVE_PREFIX);
      const profileDirs = await fs.readdir(profilesTempDir).catch(() => [] as string[]);

      for (const profileId of profileDirs) {
        const sourceProfilePath = path.join(profilesTempDir, profileId, 'profile.json');
        const destinationDir = path.join(profilesDir, profileId);
        const destinationProfilePath = path.join(destinationDir, 'profile.json');

        try {
          await fs.access(sourceProfilePath);
          await fs.mkdir(destinationDir, { recursive: true });
          await fs.copyFile(sourceProfilePath, destinationProfilePath);
        } catch {
          // Ignore missing or unreadable profile.json files inside the archive.
        }
      }

      logger.info('Backup restored', { filename });
    } finally {
      await fs.rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  getBackupPath(filename: string): string {
    validateBackupFilename(filename);
    return path.join(this.backupsDir, filename);
  }

  private async rotateBackups(): Promise<void> {
    const entries = await this.listBackups();
    if (entries.length <= MAX_BACKUPS) {
      return;
    }

    const staleEntries = entries.slice(MAX_BACKUPS);
    for (const entry of staleEntries) {
      await fs.unlink(path.join(this.backupsDir, entry.filename)).catch(() => undefined);
      logger.info('Old backup deleted', { filename: entry.filename });
    }
  }
}

async function extractBackupArchive(backupPath: string, destinationPath: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  if (process.platform === WINDOWS_PLATFORM) {
    await execFileAsync(POWERSHELL_BINARY, [
      ...POWERSHELL_ARGS,
      buildWindowsRestoreCommand(backupPath, destinationPath),
    ]);
    return;
  }

  await execFileAsync(UNZIP_BINARY, [...UNZIP_ARGS, backupPath, '-d', destinationPath]);
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function parseTimestampFromFilename(filename: string): string {
  const rawTimestamp = filename.replace(BACKUP_FILE_PREFIX, '').replace(ZIP_EXTENSION, '');
  return rawTimestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
}

function validateBackupFilename(filename: string): void {
  if (filename.includes('/') || filename.includes('\\') || !filename.endsWith(ZIP_EXTENSION)) {
    throw new ValidationError(INVALID_BACKUP_FILENAME_MESSAGE, {
      field: 'filename',
      value: filename,
    });
  }
}

function buildWindowsRestoreCommand(backupPath: string, destinationPath: string): string {
  return `Expand-Archive -Path "${backupPath}" -DestinationPath "${destinationPath}" -Force`;
}

export const backupManager = new BackupManager();
