import { Router, Request, Response } from 'express';
import { backupManager } from '../../managers/BackupManager';
import { logger } from '../../utils/logger';

const router = Router();

// GET /api/backups
router.get('/backups', async (_req: Request, res: Response) => {
  try {
    const backups = await backupManager.listBackups();
    res.json({ success: true, data: backups });
  } catch (err) {
    logger.error('GET /api/backups error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to list backups' });
  }
});

// POST /api/backups — create backup now
router.post('/backups', async (_req: Request, res: Response) => {
  try {
    const entry = await backupManager.createBackup();
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    logger.error('POST /api/backups error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Backup failed' });
  }
});

// POST /api/backups/restore/:filename
router.post('/backups/restore/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    await backupManager.restoreBackup(filename);
    res.json({ success: true, data: null });
  } catch (err) {
    logger.error('POST /api/backups/restore error', { error: err instanceof Error ? err.message : String(err) });
    const status = err instanceof Error && err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Restore failed' });
  }
});

// GET /api/backups/export/:filename — download zip
router.get('/backups/export/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = backupManager.getBackupPath(filename);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (err) {
    logger.error('GET /api/backups/export error', { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Export failed' });
  }
});

export default router;
