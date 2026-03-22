import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { proxyManager } from '../managers/ProxyManager';

const router = Router();

const ProxyBodySchema = z.object({
  type: z.enum(['http', 'https', 'socks4', 'socks5']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
});

const BulkImportSchema = z.object({
  text: z.string().min(1),
  defaultType: z.enum(['http', 'https', 'socks4', 'socks5']).optional(),
});

// GET /api/proxies
router.get('/proxies', (_req: Request, res: Response) => {
  const proxies = proxyManager.listProxies().map((p) => ({
    ...p,
    password: p.password ? '***' : undefined,
  }));
  res.json({ success: true, data: proxies });
});

// POST /api/proxies
router.post('/proxies', async (req: Request, res: Response) => {
  const parsed = ProxyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid proxy data', details: parsed.error.issues });
    return;
  }
  try {
    const proxy = await proxyManager.createProxy(parsed.data);
    res.status(201).json({ success: true, data: { ...proxy, password: proxy.password ? '***' : undefined } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/proxies/import-bulk', async (req: Request, res: Response) => {
  const parsed = BulkImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid proxy import data', details: parsed.error.issues });
    return;
  }

  try {
    const result = await proxyManager.importProxyList(parsed.data.text, parsed.data.defaultType ?? 'http');
    res.status(201).json({
      success: true,
      data: {
        created: result.created.map((proxy) => ({ ...proxy, password: proxy.password ? '***' : undefined })),
        skipped: result.skipped,
      },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// PUT /api/proxies/:id
router.put('/proxies/:id', async (req: Request, res: Response) => {
  const parsed = ProxyBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid proxy data', details: parsed.error.issues });
    return;
  }
  try {
    const proxy = await proxyManager.updateProxy(req.params['id'] as string, parsed.data);
    res.json({ success: true, data: { ...proxy, password: proxy.password ? '***' : undefined } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// DELETE /api/proxies/:id
router.delete('/proxies/:id', async (req: Request, res: Response) => {
  try {
    await proxyManager.deleteProxy(req.params['id'] as string);
    res.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// POST /api/proxies/:id/test
router.post('/proxies/:id/test', async (req: Request, res: Response) => {
  const proxy = proxyManager.getProxy(req.params['id'] as string);
  if (!proxy) {
    res.status(404).json({ success: false, error: 'Proxy not found' });
    return;
  }
  try {
    const ip = await proxyManager.testProxy(proxy);
    let timezone: string | null = null;
    try {
      timezone = await proxyManager.detectTimezoneFromProxy(ip);
    } catch {
      // timezone detection is best-effort
    }
    const checkedAt = new Date().toISOString();
    await proxyManager.recordTestSnapshot(proxy.id, {
      lastCheckAt: checkedAt,
      lastCheckStatus: 'healthy',
      lastCheckIp: ip,
      lastCheckTimezone: timezone,
      lastCheckError: undefined,
    });
    res.json({ success: true, data: { ip, timezone } });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await proxyManager.recordTestSnapshot(proxy.id, {
      lastCheckAt: new Date().toISOString(),
      lastCheckStatus: 'failing',
      lastCheckError: error,
      lastCheckIp: undefined,
      lastCheckTimezone: null,
    });
    res.status(502).json({ success: false, error });
  }
});

export default router;
