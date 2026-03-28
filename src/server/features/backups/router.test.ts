import fs from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../core/errors';

const mocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
  getBackupPath: vi.fn(),
  listBackups: vi.fn(),
  loggerError: vi.fn(),
  restoreBackup: vi.fn(),
}));

vi.mock('./BackupManager', () => ({
  backupManager: {
    createBackup: mocks.createBackup,
    getBackupPath: mocks.getBackupPath,
    listBackups: mocks.listBackups,
    restoreBackup: mocks.restoreBackup,
  },
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('backups router', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-backup-router-'));
    mocks.createBackup.mockReset();
    mocks.getBackupPath.mockReset();
    mocks.listBackups.mockReset();
    mocks.loggerError.mockReset();
    mocks.restoreBackup.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function withServer(
    testFn: (baseUrl: string) => Promise<void>,
  ): Promise<void> {
    const { default: router } = await import('./router');
    const app = express();
    app.use('/api', router);
    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind backups router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('returns the backup listing through the success envelope', async () => {
    mocks.listBackups.mockResolvedValue([{ filename: 'backup-1.zip', timestamp: '2026-03-27T00:00:00.000Z', sizeBytes: 10 }]);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups`);
      const payload = await response.json() as { success: boolean; data: unknown[] };

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        success: true,
        data: [{ filename: 'backup-1.zip', timestamp: '2026-03-27T00:00:00.000Z', sizeBytes: 10 }],
      });
    });
  });

  it('returns a structured error when listing backups fails', async () => {
    mocks.listBackups.mockRejectedValue(new Error('listing failed'));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups`);
      const payload = await response.json() as { success: boolean; error: string };

      expect(response.status).toBe(500);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Internal server error');
      expect(mocks.loggerError).toHaveBeenCalledWith('GET /api/backups error', { error: 'Internal server error' });
    });
  });

  it('creates a backup and returns 201 with the created entry', async () => {
    mocks.createBackup.mockResolvedValue({
      filename: 'backup-2.zip',
      timestamp: '2026-03-27T01:00:00.000Z',
      sizeBytes: 20,
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups`, { method: 'POST' });
      const payload = await response.json() as { success: boolean; data: { filename: string } };

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(payload.data.filename).toBe('backup-2.zip');
    });
  });

  it('returns a structured error when backup creation fails', async () => {
    mocks.createBackup.mockRejectedValue(new Error('create failed'));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups`, { method: 'POST' });
      const payload = await response.json() as { success: boolean; error: string };

      expect(response.status).toBe(500);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Internal server error');
      expect(mocks.loggerError).toHaveBeenCalledWith('POST /api/backups error', { error: 'Internal server error' });
    });
  });

  it('restores a backup from the filename route parameter', async () => {
    mocks.restoreBackup.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/restore/backup-3.zip`, { method: 'POST' });
      const payload = await response.json() as { success: boolean; data: null };

      expect(response.status).toBe(200);
      expect(payload).toEqual({ success: true, data: null });
      expect(mocks.restoreBackup).toHaveBeenCalledWith('backup-3.zip');
    });
  });

  it('returns a structured error when backup restore fails', async () => {
    mocks.restoreBackup.mockRejectedValue(new ValidationError('Invalid backup filename', {
      field: 'filename',
      value: '../escape.zip',
    }));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/restore/..%2Fescape.zip`, { method: 'POST' });
      const payload = await response.json() as { success: boolean; error: string };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Invalid backup filename');
      expect(mocks.loggerError).toHaveBeenCalledWith('POST /api/backups/restore error', { error: 'Invalid backup filename' });
    });
  });

  it('exports a backup zip with download headers', async () => {
    const exportPath = path.join(tempDir, 'backup-4.zip');
    await fs.writeFile(exportPath, 'zip-binary', 'utf-8');
    mocks.getBackupPath.mockReturnValue(exportPath);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/export/backup-4.zip`);
      const payload = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/zip');
      expect(response.headers.get('content-disposition')).toBe('attachment; filename="backup-4.zip"');
      expect(payload).toBe('zip-binary');
    });
  });

  it('returns a structured error when backup export fails', async () => {
    mocks.getBackupPath.mockImplementation(() => {
      throw new ValidationError('Invalid backup filename', {
        field: 'filename',
        value: 'notes.txt',
      });
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/export/notes.txt`);
      const payload = await response.json() as { success: boolean; error: string };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Invalid backup filename');
      expect(mocks.loggerError).toHaveBeenCalledWith('GET /api/backups/export error', { error: 'Invalid backup filename' });
    });
  });
});
