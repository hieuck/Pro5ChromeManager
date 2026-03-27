import { Router, Request, Response } from 'express';
import { backupManager } from './BackupManager';
import { logger } from '../../core/logging/logger';
import { sendSuccess, sendError, getErrorStatusCode, getErrorMessage } from '../../core/http';

const router = Router();

// GET /api/backups
router.get('/backups', async (_req: Request, res: Response) => {
  try {
    const backups = await backupManager.listBackups();
    sendSuccess(res, backups);
  } catch (err) {
    logger.error('GET /api/backups error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

// POST /api/backups — create backup now
router.post('/backups', async (_req: Request, res: Response) => {
  try {
    const entry = await backupManager.createBackup();
    sendSuccess(res, entry, 201);
  } catch (err) {
    logger.error('POST /api/backups error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

// POST /api/backups/restore/:filename
router.post('/backups/restore/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    await backupManager.restoreBackup(filename);
    sendSuccess(res, null);
  } catch (err) {
    logger.error('POST /api/backups/restore error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
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
    logger.error('GET /api/backups/export error', { error: getErrorMessage(err) });
    sendError(res, getErrorStatusCode(err), getErrorMessage(err));
  }
});

export default router;
