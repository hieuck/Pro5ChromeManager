import { Router, Request, Response, raw } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { browserCoreManager } from './BrowserCoreManager';
import { dataPath } from '../../core/fs/dataPaths';
import { asyncHandler } from '../../core/logging/errorHandler';
import { sendError, sendSuccess } from '../../core/http';
import { ValidationError } from '../../core/errors';

const router = Router();
const DEFAULT_IMPORT_PACKAGE_MAX_BYTES = 256 * 1024 * 1024;
const importPackageMaxBytes = Number(process.env['PRO5_BROWSER_CORE_IMPORT_MAX_BYTES']) || DEFAULT_IMPORT_PACKAGE_MAX_BYTES;

router.get('/browser-cores', asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, browserCoreManager.listInstalledCores());
}));

router.get('/browser-cores/catalog', asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, browserCoreManager.listCatalog());
}));

router.post('/browser-cores/catalog/:key/install', asyncHandler(async (req: Request, res: Response) => {
  try {
    const installed = await browserCoreManager.installCatalogCore(req.params['key'] as string);
    sendSuccess(res, installed, 201);
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('Invalid browser core artifact URL') ||
      err.message.includes('Unsupported browser core artifact protocol')
    )) {
      throw new ValidationError(err.message, { field: 'artifactUrl' });
    }
    throw err;
  }
}));

router.post(
  '/browser-cores/import-package',
  raw({ type: 'application/octet-stream', limit: importPackageMaxBytes }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      sendError(res, 400, 'Browser core package payload is required', 'VALIDATION_ERROR');
      return;
    }
    if (body.length > importPackageMaxBytes) {
      sendError(res, 413, 'Browser core package payload exceeds size limit', 'PAYLOAD_TOO_LARGE', {
        maxBytes: importPackageMaxBytes,
      });
      return;
    }

    const tmpDir = dataPath('tmp');
    const tmpPath = path.join(tmpDir, `browser-core-package-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(tmpPath, body);
      const installed = await browserCoreManager.installFromPackage(tmpPath);
      sendSuccess(res, installed, 201);
    } finally {
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    }
  }),
);

router.delete('/browser-cores/:id', asyncHandler(async (req: Request, res: Response) => {
  await browserCoreManager.deleteCore(req.params['id'] as string);
  sendSuccess(res, null);
}));

export default router;
