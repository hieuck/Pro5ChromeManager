import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { proxyManager } from './ProxyManager';
import { validateUuidParam } from '../../core/server/http/paramValidation';
import { sendSuccess, sendError, getErrorStatusCode, getErrorMessage } from '../../core/http';
import { NotFoundError } from '../../core/errors';

const router = Router();
router.param('id', validateUuidParam('id'));

const DEFAULT_PROXY_TYPE = 'http' as const;
const INVALID_PROXY_DATA_MESSAGE = 'Invalid proxy data';
const INVALID_PROXY_IMPORT_DATA_MESSAGE = 'Invalid proxy import data';
const INVALID_PROXY_TEST_REQUEST_MESSAGE = 'Invalid proxy test request';
const MASKED_PASSWORD = '***';
const PROXY_STATUS_FAILING = 'failing' as const;
const PROXY_STATUS_HEALTHY = 'healthy' as const;

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

const BulkTestSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
});

function maskProxyPassword<T extends { password?: string }>(proxy: T): T & { password?: string } {
  return {
    ...proxy,
    password: proxy.password ? MASKED_PASSWORD : undefined,
  };
}

function buildHealthySnapshot(checkedAt: string, ip: string, timezone: string | null) {
  return {
    lastCheckAt: checkedAt,
    lastCheckStatus: PROXY_STATUS_HEALTHY,
    lastCheckIp: ip,
    lastCheckTimezone: timezone,
    lastCheckError: undefined,
  };
}

function buildFailingSnapshot(checkedAt: string, errorMessage: string) {
  return {
    lastCheckAt: checkedAt,
    lastCheckStatus: PROXY_STATUS_FAILING,
    lastCheckError: errorMessage,
    lastCheckIp: undefined,
    lastCheckTimezone: null,
  };
}

async function detectTimezoneBestEffort(ip: string): Promise<string | null> {
  try {
    return await proxyManager.detectTimezoneFromProxy(ip);
  } catch {
    return null;
  }
}

// GET /api/proxies
router.get('/proxies', (_req: Request, res: Response) => {
  try {
    const proxies = proxyManager.listProxies().map(maskProxyPassword);
    sendSuccess(res, proxies);
  } catch (error) {
    sendError(res, getErrorStatusCode(error), getErrorMessage(error));
  }
});

// POST /api/proxies
router.post('/proxies', async (req: Request, res: Response) => {
  const parsed = ProxyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, INVALID_PROXY_DATA_MESSAGE);
    return;
  }
  try {
    const proxy = await proxyManager.createProxy(parsed.data);
    sendSuccess(res, maskProxyPassword(proxy), 201);
  } catch (error) {
    sendError(res, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/proxies/import-bulk', async (req: Request, res: Response) => {
  const parsed = BulkImportSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, INVALID_PROXY_IMPORT_DATA_MESSAGE);
    return;
  }

  try {
    const result = await proxyManager.importProxyList(parsed.data.text, parsed.data.defaultType ?? DEFAULT_PROXY_TYPE);
    sendSuccess(res, {
      created: result.created.map(maskProxyPassword),
      skipped: result.skipped,
    }, 201);
  } catch (error) {
    sendError(res, getErrorStatusCode(error), getErrorMessage(error));
  }
});

router.post('/proxies/test-bulk', async (req: Request, res: Response) => {
  const parsed = BulkTestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, 400, INVALID_PROXY_TEST_REQUEST_MESSAGE);
    return;
  }

  const selectedIds = parsed.data.ids;
  const proxies = selectedIds
    ? selectedIds
      .map((id) => proxyManager.getProxy(id))
      .filter((proxy): proxy is NonNullable<typeof proxy> => Boolean(proxy))
    : proxyManager.listProxies();

  const results = await Promise.all(proxies.map(async (proxy) => {
    try {
      const ip = await proxyManager.testProxy(proxy);
      const timezone = await detectTimezoneBestEffort(ip);
      const checkedAt = new Date().toISOString();
      await proxyManager.recordTestSnapshot(proxy.id, buildHealthySnapshot(checkedAt, ip, timezone));
      return {
        id: proxy.id,
        success: true,
        ip,
        timezone,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await proxyManager.recordTestSnapshot(proxy.id, buildFailingSnapshot(new Date().toISOString(), error));
      return {
        id: proxy.id,
        success: false,
        error,
      };
    }
  }));

  sendSuccess(res, {
    total: proxies.length,
    healthy: results.filter((result) => result.success).length,
    failing: results.filter((result) => !result.success).length,
    results,
  });
});

// PUT /api/proxies/:id
router.put('/proxies/:id', async (req: Request, res: Response) => {
  const parsed = ProxyBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, INVALID_PROXY_DATA_MESSAGE);
    return;
  }
  try {
    const proxy = await proxyManager.updateProxy(req.params['id'] as string, parsed.data);
    sendSuccess(res, maskProxyPassword(proxy));
  } catch (error) {
    sendError(res, getErrorStatusCode(error), getErrorMessage(error));
  }
});

// DELETE /api/proxies/:id
router.delete('/proxies/:id', async (req: Request, res: Response) => {
  try {
    await proxyManager.deleteProxy(req.params['id'] as string);
    sendSuccess(res, null);
  } catch (error) {
    sendError(res, getErrorStatusCode(error), getErrorMessage(error));
  }
});

// POST /api/proxies/:id/test
router.post('/proxies/:id/test', async (req: Request, res: Response) => {
  try {
    const proxy = proxyManager.getProxy(req.params['id'] as string);
    if (!proxy) {
      throw new NotFoundError('Proxy', req.params['id'] as string);
    }
    const ip = await proxyManager.testProxy(proxy);
    const timezone = await detectTimezoneBestEffort(ip);
    const checkedAt = new Date().toISOString();
    await proxyManager.recordTestSnapshot(proxy.id, buildHealthySnapshot(checkedAt, ip, timezone));
    sendSuccess(res, { ip, timezone });
  } catch (error) {
    if (error instanceof NotFoundError) {
      sendError(res, 404, getErrorMessage(error));
      return;
    }
    const proxyId = req.params['id'] as string;
    const errorMessage = getErrorMessage(error);
    const proxy = proxyManager.getProxy(proxyId);
    if (proxy) {
      await proxyManager.recordTestSnapshot(proxy.id, buildFailingSnapshot(new Date().toISOString(), errorMessage));
    }
    sendError(res, 502, errorMessage);
  }
});

export default router;
