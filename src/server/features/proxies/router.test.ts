import express from 'express';
import http from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FIRST_PROXY_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_PROXY_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createProxy: vi.fn(),
  deleteProxy: vi.fn(),
  detectTimezoneFromProxy: vi.fn(),
  getProxy: vi.fn(),
  importProxyList: vi.fn(),
  listProxies: vi.fn(),
  recordTestSnapshot: vi.fn(),
  testProxy: vi.fn(),
  updateProxy: vi.fn(),
}));

vi.mock('./ProxyManager', () => ({
  proxyManager: {
    createProxy: mocks.createProxy,
    deleteProxy: mocks.deleteProxy,
    detectTimezoneFromProxy: mocks.detectTimezoneFromProxy,
    getProxy: mocks.getProxy,
    importProxyList: mocks.importProxyList,
    listProxies: mocks.listProxies,
    recordTestSnapshot: mocks.recordTestSnapshot,
    testProxy: mocks.testProxy,
    updateProxy: mocks.updateProxy,
  },
}));

describe('proxies router', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createProxy.mockReset();
    mocks.deleteProxy.mockReset();
    mocks.detectTimezoneFromProxy.mockReset();
    mocks.getProxy.mockReset();
    mocks.importProxyList.mockReset();
    mocks.listProxies.mockReset();
    mocks.recordTestSnapshot.mockReset();
    mocks.testProxy.mockReset();
    mocks.updateProxy.mockReset();
  });

  async function withServer(testFn: (baseUrl: string) => Promise<void>): Promise<void> {
    const { default: router } = await import('./router');
    const app = express();
    app.use(express.json());
    app.use('/api', router);
    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind proxies router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('lists proxies with masked passwords', async () => {
    mocks.listProxies.mockReturnValue([
      {
        id: FIRST_PROXY_ID,
        type: 'http',
        host: '1.2.3.4',
        port: 8080,
        username: 'alice',
        password: 'secret',
      },
    ]);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/proxies`);
      const payload = await response.json() as { data: Array<{ password?: string }>; success: boolean };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([
        expect.objectContaining({
          id: FIRST_PROXY_ID,
          password: '***',
        }),
      ]);
    });
  });

  it('validates create and update payloads', async () => {
    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/proxies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ftp',
          host: '',
          port: 0,
        }),
      });
      const createPayload = await createResponse.json() as { error: string; success: boolean };

      expect(createResponse.status).toBe(400);
      expect(createPayload).toEqual(expect.objectContaining({
        success: false,
        error: 'Invalid proxy data',
      }));

      const updateResponse = await fetch(`${baseUrl}/api/proxies/${FIRST_PROXY_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          port: 70000,
        }),
      });
      const updatePayload = await updateResponse.json() as { error: string; success: boolean };

      expect(updateResponse.status).toBe(400);
      expect(updatePayload).toEqual(expect.objectContaining({
        success: false,
        error: 'Invalid proxy data',
      }));
    });
  });

  it('creates proxies and bulk-imports them with the default type fallback', async () => {
    mocks.createProxy.mockResolvedValue({
      id: FIRST_PROXY_ID,
      type: 'http',
      host: '1.2.3.4',
      port: 8080,
      username: 'alice',
      password: 'secret',
    });
    mocks.importProxyList.mockResolvedValue({
      created: [
        {
          id: SECOND_PROXY_ID,
          type: 'http',
          host: '5.6.7.8',
          port: 9090,
          password: 'hidden',
        },
      ],
      skipped: 1,
    });

    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/proxies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'http',
          host: '1.2.3.4',
          port: 8080,
          username: 'alice',
          password: 'secret',
        }),
      });
      const createPayload = await createResponse.json() as { data: { password?: string }; success: boolean };

      expect(createResponse.status).toBe(201);
      expect(createPayload.success).toBe(true);
      expect(createPayload.data.password).toBe('***');

      const importResponse = await fetch(`${baseUrl}/api/proxies/import-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '5.6.7.8:9090',
        }),
      });
      const importPayload = await importResponse.json() as {
        data: { created: Array<{ password?: string }>; skipped: number };
        success: boolean;
      };

      expect(importResponse.status).toBe(201);
      expect(importPayload.success).toBe(true);
      expect(importPayload.data.skipped).toBe(1);
      expect(importPayload.data.created[0]?.password).toBe('***');
      expect(mocks.importProxyList).toHaveBeenCalledWith('5.6.7.8:9090', 'http');
    });
  });

  it('tests selected proxies in bulk and records healthy and failing snapshots', async () => {
    mocks.getProxy.mockImplementation((id: string) => {
      if (id === FIRST_PROXY_ID) {
        return { id: FIRST_PROXY_ID, type: 'http', host: '1.2.3.4', port: 8080 };
      }
      if (id === SECOND_PROXY_ID) {
        return { id: SECOND_PROXY_ID, type: 'socks5', host: '5.6.7.8', port: 1080 };
      }
      return undefined;
    });
    mocks.testProxy
      .mockResolvedValueOnce('203.0.113.10')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    mocks.detectTimezoneFromProxy.mockResolvedValue('Asia/Bangkok');
    mocks.recordTestSnapshot.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/proxies/test-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [FIRST_PROXY_ID, SECOND_PROXY_ID],
        }),
      });
      const payload = await response.json() as {
        data: {
          failing: number;
          healthy: number;
          results: Array<{ error?: string; id: string; success: boolean }>;
          total: number;
        };
        success: boolean;
      };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.total).toBe(2);
      expect(payload.data.healthy).toBe(1);
      expect(payload.data.failing).toBe(1);
      expect(payload.data.results).toEqual([
        expect.objectContaining({
          id: FIRST_PROXY_ID,
          success: true,
        }),
        expect.objectContaining({
          id: SECOND_PROXY_ID,
          success: false,
          error: 'connect ECONNREFUSED',
        }),
      ]);
      expect(mocks.recordTestSnapshot).toHaveBeenCalledTimes(2);
      expect(mocks.recordTestSnapshot.mock.calls).toEqual(
        expect.arrayContaining([
          [
            FIRST_PROXY_ID,
            expect.objectContaining({
              lastCheckStatus: 'healthy',
              lastCheckIp: '203.0.113.10',
              lastCheckTimezone: 'Asia/Bangkok',
            }),
          ],
          [
            SECOND_PROXY_ID,
            expect.objectContaining({
              lastCheckStatus: 'failing',
              lastCheckError: 'connect ECONNREFUSED',
              lastCheckTimezone: null,
            }),
          ],
        ]),
      );
    });
  });

  it('updates and deletes proxies through the manager', async () => {
    mocks.updateProxy.mockResolvedValue({
      id: FIRST_PROXY_ID,
      type: 'https',
      host: '1.2.3.4',
      port: 8443,
      password: undefined,
    });
    mocks.deleteProxy.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const updateResponse = await fetch(`${baseUrl}/api/proxies/${FIRST_PROXY_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'https',
          port: 8443,
        }),
      });
      const updatePayload = await updateResponse.json() as { data: { type: string }; success: boolean };

      expect(updateResponse.status).toBe(200);
      expect(updatePayload.success).toBe(true);
      expect(updatePayload.data.type).toBe('https');

      const deleteResponse = await fetch(`${baseUrl}/api/proxies/${FIRST_PROXY_ID}`, {
        method: 'DELETE',
      });
      const deletePayload = await deleteResponse.json() as { data: null; success: boolean };

      expect(deleteResponse.status).toBe(200);
      expect(deletePayload).toEqual({ success: true, data: null });
      expect(mocks.deleteProxy).toHaveBeenCalledWith(FIRST_PROXY_ID);
    });
  });

  it('returns 404 when testing a missing proxy directly', async () => {
    mocks.getProxy.mockReturnValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/proxies/${FIRST_PROXY_ID}/test`, {
        method: 'POST',
      });
      const payload = await response.json() as { error: string; success: boolean };

      expect(response.status).toBe(404);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe(`Proxy not found: ${FIRST_PROXY_ID}`);
    });
  });

  it('tests a single proxy successfully and records its snapshot', async () => {
    mocks.getProxy.mockReturnValue({
      id: FIRST_PROXY_ID,
      type: 'http',
      host: '1.2.3.4',
      port: 8080,
    });
    mocks.testProxy.mockResolvedValue('198.51.100.1');
    mocks.detectTimezoneFromProxy.mockResolvedValue('UTC');
    mocks.recordTestSnapshot.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/proxies/${FIRST_PROXY_ID}/test`, {
        method: 'POST',
      });
      const payload = await response.json() as {
        data: { ip: string; timezone: string | null };
        success: boolean;
      };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual({
        ip: '198.51.100.1',
        timezone: 'UTC',
      });
      expect(mocks.recordTestSnapshot).toHaveBeenCalledWith(FIRST_PROXY_ID, expect.objectContaining({
        lastCheckStatus: 'healthy',
        lastCheckIp: '198.51.100.1',
        lastCheckTimezone: 'UTC',
      }));
    });
  });

  it('records a failing snapshot and returns 502 when a direct proxy test fails', async () => {
    mocks.getProxy.mockReturnValue({
      id: FIRST_PROXY_ID,
      type: 'http',
      host: '1.2.3.4',
      port: 8080,
    });
    mocks.testProxy.mockRejectedValue(new Error('proxy health failed'));
    mocks.recordTestSnapshot.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/proxies/${FIRST_PROXY_ID}/test`, {
        method: 'POST',
      });
      const payload = await response.json() as { error: string; success: boolean };

      expect(response.status).toBe(502);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Internal server error');
      expect(mocks.recordTestSnapshot).toHaveBeenCalledWith(FIRST_PROXY_ID, expect.objectContaining({
        lastCheckStatus: 'failing',
        lastCheckError: 'Internal server error',
      }));
    });
  });
});
