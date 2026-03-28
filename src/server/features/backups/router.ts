import { Request, Response, Router } from 'express';
import { backupManager } from './BackupManager';
import { logger } from '../../core/logging/logger';
import { getErrorMessage, getErrorStatusCode, sendError, sendSuccess } from '../../core/http';

const router = Router();

const BACKUPS_ROUTE = '/backups';
const RESTORE_ROUTE = '/backups/restore/:filename';
const EXPORT_ROUTE = '/backups/export/:filename';
const ZIP_CONTENT_TYPE = 'application/zip';
const CONTENT_TYPE_HEADER = 'Content-Type';
const CONTENT_DISPOSITION_HEADER = 'Content-Disposition';

function handleBackupRouteError(operation: string, error: unknown, response: Response): void {
  logger.error(`${operation} error`, { error: getErrorMessage(error) });
  sendError(response, getErrorStatusCode(error), getErrorMessage(error));
}

router.get(BACKUPS_ROUTE, async (_request: Request, response: Response) => {
  try {
    const backups = await backupManager.listBackups();
    sendSuccess(response, backups);
  } catch (error) {
    handleBackupRouteError('GET /api/backups', error, response);
  }
});

router.post(BACKUPS_ROUTE, async (_request: Request, response: Response) => {
  try {
    const entry = await backupManager.createBackup();
    sendSuccess(response, entry, 201);
  } catch (error) {
    handleBackupRouteError('POST /api/backups', error, response);
  }
});

router.post(RESTORE_ROUTE, async (request: Request, response: Response) => {
  try {
    const { filename } = request.params;
    await backupManager.restoreBackup(filename);
    sendSuccess(response, null);
  } catch (error) {
    handleBackupRouteError('POST /api/backups/restore', error, response);
  }
});

router.get(EXPORT_ROUTE, async (request: Request, response: Response) => {
  try {
    const { filename } = request.params;
    const filePath = backupManager.getBackupPath(filename);
    response.setHeader(CONTENT_TYPE_HEADER, ZIP_CONTENT_TYPE);
    response.setHeader(CONTENT_DISPOSITION_HEADER, `attachment; filename="${filename}"`);
    response.sendFile(filePath);
  } catch (error) {
    handleBackupRouteError('GET /api/backups/export', error, response);
  }
});

export default router;
