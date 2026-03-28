import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

describe('BackupManager', () => {
  let tempDir: string;
  let backupsDir: string;
  let profilesDir: string;
  let previousDataDir: string | undefined;
  let previousNodeEnv: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-backups-'));
    backupsDir = path.join(tempDir, 'backups');
    profilesDir = path.join(tempDir, 'profiles');
    previousDataDir = process.env['DATA_DIR'];
    previousNodeEnv = process.env['NODE_ENV'];
    process.env['DATA_DIR'] = tempDir;
    process.env['NODE_ENV'] = 'test';
    vi.resetModules();

    const { configManager } = await import('../config/ConfigManager');
    await configManager.load();
    await configManager.update({ profilesDir });
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (previousDataDir === undefined) {
      delete process.env['DATA_DIR'];
    } else {
      process.env['DATA_DIR'] = previousDataDir;
    }

    if (previousNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = previousNodeEnv;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createProfileFixture(
    profileId: string,
    profileJson: Record<string, unknown>,
    defaultBookmarks = 'bookmarks-fixture',
  ): Promise<void> {
    const profileDir = path.join(profilesDir, profileId);
    await fs.mkdir(path.join(profileDir, 'Default'), { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'profile.json'),
      JSON.stringify(profileJson, null, 2),
      'utf-8',
    );
    await fs.writeFile(path.join(profileDir, 'Default', 'Bookmarks'), defaultBookmarks, 'utf-8');
  }

  it('creates backups, lists them, and restores profile metadata from the archive', async () => {
    const { BackupManager } = await import('./BackupManager');
    const manager = new BackupManager(backupsDir);

    await createProfileFixture('profile-1', { name: 'Original Profile', runtime: 'chrome' });
    await fs.writeFile(path.join(tempDir, 'proxies.json'), JSON.stringify([{ id: 'proxy-1' }]), 'utf-8');

    const entry = await manager.createBackup();
    expect(entry.filename).toMatch(/^backup-.*\.zip$/);
    expect(entry.sizeBytes).toBeGreaterThan(0);
    expect(await fs.access(path.join(backupsDir, entry.filename)).then(() => true).catch(() => false)).toBe(true);

    const listedBackups = await manager.listBackups();
    expect(listedBackups).toEqual([expect.objectContaining({
      filename: entry.filename,
      timestamp: entry.timestamp,
      sizeBytes: entry.sizeBytes,
    })]);

    await fs.writeFile(
      path.join(profilesDir, 'profile-1', 'profile.json'),
      JSON.stringify({ name: 'Mutated Profile', runtime: 'chrome' }, null, 2),
      'utf-8',
    );

    await manager.restoreBackup(entry.filename);

    const restoredProfile = JSON.parse(
      await fs.readFile(path.join(profilesDir, 'profile-1', 'profile.json'), 'utf-8'),
    ) as { name: string };
    expect(restoredProfile.name).toBe('Original Profile');

    const profileBookmarkPath = path.join(profilesDir, 'profile-1', 'Default', 'Bookmarks');
    expect(await fs.readFile(profileBookmarkPath, 'utf-8')).toBe('bookmarks-fixture');

    const backupDirectoryEntries = await fs.readdir(backupsDir);
    expect(backupDirectoryEntries.some((entryName) => entryName.startsWith('restore-tmp-'))).toBe(false);
  });

  it('sorts backup entries newest-first and parses timestamps from backup filenames', async () => {
    const { BackupManager } = await import('./BackupManager');
    const manager = new BackupManager(backupsDir);

    await fs.mkdir(backupsDir, { recursive: true });
    await fs.writeFile(path.join(backupsDir, 'backup-2026-03-25T11-22-33-444Z.zip'), 'first', 'utf-8');
    await fs.writeFile(path.join(backupsDir, 'ignore-me.txt'), 'ignored', 'utf-8');
    await fs.writeFile(path.join(backupsDir, 'backup-2026-03-27T08-09-10-111Z.zip'), 'second', 'utf-8');

    const backups = await manager.listBackups();

    expect(backups).toEqual([
      {
        filename: 'backup-2026-03-27T08-09-10-111Z.zip',
        timestamp: '2026-03-27T08:09:10.111Z',
        sizeBytes: 6,
      },
      {
        filename: 'backup-2026-03-25T11-22-33-444Z.zip',
        timestamp: '2026-03-25T11:22:33.444Z',
        sizeBytes: 5,
      },
    ]);
  });

  it('rotates stale backups beyond the retention limit and validates requested filenames', async () => {
    const { BackupManager } = await import('./BackupManager');
    const manager = new BackupManager(backupsDir);
    const managerInternals = manager as unknown as { rotateBackups: () => Promise<void> };

    await fs.mkdir(backupsDir, { recursive: true });
    const backupNames = [
      'backup-2026-03-19T00-00-00-000Z.zip',
      'backup-2026-03-20T00-00-00-000Z.zip',
      'backup-2026-03-21T00-00-00-000Z.zip',
      'backup-2026-03-22T00-00-00-000Z.zip',
      'backup-2026-03-23T00-00-00-000Z.zip',
      'backup-2026-03-24T00-00-00-000Z.zip',
      'backup-2026-03-25T00-00-00-000Z.zip',
      'backup-2026-03-26T00-00-00-000Z.zip',
      'backup-2026-03-27T00-00-00-000Z.zip',
    ];

    for (const backupName of backupNames) {
      await fs.writeFile(path.join(backupsDir, backupName), backupName, 'utf-8');
    }

    await managerInternals.rotateBackups();

    const retained = await manager.listBackups();
    expect(retained.map((entry) => entry.filename)).toEqual([
      'backup-2026-03-27T00-00-00-000Z.zip',
      'backup-2026-03-26T00-00-00-000Z.zip',
      'backup-2026-03-25T00-00-00-000Z.zip',
      'backup-2026-03-24T00-00-00-000Z.zip',
      'backup-2026-03-23T00-00-00-000Z.zip',
      'backup-2026-03-22T00-00-00-000Z.zip',
      'backup-2026-03-21T00-00-00-000Z.zip',
    ]);
    expect(await fs.access(path.join(backupsDir, 'backup-2026-03-20T00-00-00-000Z.zip')).then(() => true).catch(() => false)).toBe(false);

    expect(() => manager.getBackupPath('../escape.zip')).toThrow('Invalid backup filename');
    await expect(manager.restoreBackup('notes.txt')).rejects.toThrow('Invalid backup filename');
  });

  it('runs auto backup on the configured interval without creating duplicate timers', async () => {
    vi.useFakeTimers();
    const { BackupManager } = await import('./BackupManager');
    const manager = new BackupManager(backupsDir);
    const createBackupSpy = vi.spyOn(manager, 'createBackup').mockResolvedValue({
      filename: 'backup-2026-03-27T00-00-00-000Z.zip',
      timestamp: '2026-03-27T00:00:00.000Z',
      sizeBytes: 1,
    });

    manager.startAutoBackup();
    manager.startAutoBackup();
    await vi.advanceTimersByTimeAsync(AUTO_BACKUP_INTERVAL_MS);
    expect(createBackupSpy).toHaveBeenCalledTimes(1);

    manager.stopAutoBackup();
    await vi.advanceTimersByTimeAsync(AUTO_BACKUP_INTERVAL_MS);
    expect(createBackupSpy).toHaveBeenCalledTimes(1);
  });
});
