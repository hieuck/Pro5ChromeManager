import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import archiver from 'archiver';
import { logger } from '../utils/logger';
import { configManager } from './ConfigManager';

export interface BackupEntry {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

const BACKUPS_DIR = path.resolve('data/backups');
const MAX_BACKUPS = 7;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export class BackupManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly backupsDir: string;

  constructor(backupsDir?: string) {
    this.backupsDir = backupsDir ?? BACKUPS_DIR;
  }

  startAutoBackup(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.createBackup().catch((err) => {
        logger.error('Auto-backup failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }, BACKUP_INTERVAL_MS);
    logger.info('BackupManager: auto-backup started (interval 24h)');
  }

  stopAutoBackup(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async createBackup(): Promise<BackupEntry> {
    await fs.mkdir(this.backupsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const destPath = path.join(this.backupsDir, filename);

    const profilesDir = path.resolve(configManager.get().profilesDir);
    const configPath = path.resolve('data/config.json');
    const proxiesPath = path.resolve('data/proxies.json');

    // Check which optional files exist before entering the sync Promise callback
    const configExists = await fs.access(configPath).then(() => true).catch(() => false);
    const proxiesExists = await fs.access(proxiesPath).then(() => true).catch(() => false);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      if (configExists) archive.file(configPath, { name: 'config.json' });
      if (proxiesExists) archive.file(proxiesPath, { name: 'proxies.json' });

      // Add only profile.json from each profile (skip Default/ — too large)
      archive.glob('*/profile.json', { cwd: profilesDir }, { prefix: 'profiles' });

      void archive.finalize();
    });

    const stat = await fs.stat(destPath);
    const entry: BackupEntry = { filename, timestamp, sizeBytes: stat.size };

    await this.rotateBackups();
    logger.info('Backup created', { filename, sizeBytes: stat.size });
    return entry;
  }

  async listBackups(): Promise<BackupEntry[]> {
    await fs.mkdir(this.backupsDir, { recursive: true });
    const files = await fs.readdir(this.backupsDir);
    const entries: BackupEntry[] = [];

    for (const file of files.filter((f) => f.endsWith('.zip'))) {
      try {
        const stat = await fs.stat(path.join(this.backupsDir, file));
        // Reconstruct ISO timestamp from filename: backup-2026-03-22T12-00-00-000Z.zip
        const raw = file.replace('backup-', '').replace('.zip', '');
        // raw = "2026-03-22T12-00-00-000Z" → "2026-03-22T12:00:00.000Z"
        const ts = raw.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
        entries.push({ filename: file, timestamp: ts, sizeBytes: stat.size });
      } catch { /* skip corrupted entries */ }
    }

    return entries.sort((a, b) => b.filename.localeCompare(a.filename));
  }

  /**
   * Restore profile.json files from a backup zip.
   * Uses Node.js built-in child_process to call PowerShell Expand-Archive (Windows)
   * or unzip (Linux/Mac) — no extra npm dependency needed.
   */
  async restoreBackup(filename: string): Promise<void> {
    if (filename.includes('/') || filename.includes('\\') || !filename.endsWith('.zip')) {
      throw new Error('Invalid backup filename');
    }
    const backupPath = path.join(this.backupsDir, filename);
    await fs.access(backupPath); // throws ENOENT if not found

    const profilesDir = path.resolve(configManager.get().profilesDir);
    const tmpDir = path.join(this.backupsDir, `restore-tmp-${Date.now()}`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });

      // Extract zip using child_process — cross-platform
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      if (process.platform === 'win32') {
        await execFileAsync('powershell', [
          '-NoProfile', '-Command',
          `Expand-Archive -Path "${backupPath}" -DestinationPath "${tmpDir}" -Force`,
        ]);
      } else {
        await execFileAsync('unzip', ['-o', backupPath, '-d', tmpDir]);
      }

      // Copy profiles/*/profile.json back to profilesDir
      const profilesTmpDir = path.join(tmpDir, 'profiles');
      const profileDirs = await fs.readdir(profilesTmpDir).catch(() => [] as string[]);

      for (const profileId of profileDirs) {
        const srcJson = path.join(profilesTmpDir, profileId, 'profile.json');
        const destDir = path.join(profilesDir, profileId);
        const destJson = path.join(destDir, 'profile.json');
        try {
          await fs.access(srcJson);
          await fs.mkdir(destDir, { recursive: true });
          await fs.copyFile(srcJson, destJson);
        } catch { /* skip if file missing */ }
      }

      logger.info('Backup restored', { filename });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  getBackupPath(filename: string): string {
    if (filename.includes('/') || filename.includes('\\') || !filename.endsWith('.zip')) {
      throw new Error('Invalid backup filename');
    }
    return path.join(this.backupsDir, filename);
  }

  private async rotateBackups(): Promise<void> {
    const entries = await this.listBackups();
    if (entries.length <= MAX_BACKUPS) return;

    const toDelete = entries.slice(MAX_BACKUPS);
    for (const entry of toDelete) {
      await fs.unlink(path.join(this.backupsDir, entry.filename)).catch(() => undefined);
      logger.info('Old backup deleted', { filename: entry.filename });
    }
  }
}

export const backupManager = new BackupManager();
