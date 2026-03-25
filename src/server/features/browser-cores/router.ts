import { Router, Request, Response, raw } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { browserCoreManager } from '../../managers/BrowserCoreManager';
import { dataPath } from '../../utils/dataPaths';

const router = Router();

router.get('/browser-cores', async (_req: Request, res: Response) => {
  res.json({ success: true, data: browserCoreManager.listInstalledCores() });
});

router.get('/browser-cores/catalog', async (_req: Request, res: Response) => {
  res.json({ success: true, data: browserCoreManager.listCatalog() });
});

router.post('/browser-cores/catalog/:key/install', async (req: Request, res: Response) => {
  try {
    const installed = await browserCoreManager.installCatalogCore(req.params['key'] as string);
    res.status(201).json({ success: true, data: installed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('not found')
      ? 404
      : message.includes('not available')
        ? 409
        : message.includes('Invalid browser core artifact URL') || message.includes('Unsupported browser core artifact protocol')
          ? 400
          : 500;
    res.status(status).json({ success: false, error: message });
  }
});

router.post(
  '/browser-cores/import-package',
  raw({ type: 'application/octet-stream', limit: '1024mb' }),
  async (req: Request, res: Response) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ success: false, error: 'Browser core package payload is required' });
      return;
    }

    const tmpDir = dataPath('tmp');
    const tmpPath = path.join(tmpDir, `browser-core-package-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(tmpPath, body);
      const installed = await browserCoreManager.installFromPackage(tmpPath);
      res.status(201).json({ success: true, data: installed });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    }
  },
);

router.delete('/browser-cores/:id', async (req: Request, res: Response) => {
  try {
    await browserCoreManager.deleteCore(req.params['id'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.includes('not found') ? 404 : 500).json({ success: false, error: message });
  }
});

export default router;
