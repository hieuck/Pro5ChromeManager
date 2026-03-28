import express from 'express';
import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerMiddleware } from '../../core/logging/errorHandler';

const RUNTIME_KEY = 'chrome';

const mocks = vi.hoisted(() => ({
  deleteRuntime: vi.fn(),
  listRuntimes: vi.fn(),
  refreshAvailability: vi.fn(),
  upsertRuntime: vi.fn(),
}));

vi.mock('./RuntimeManager', () => ({
  runtimeManager: {
    deleteRuntime: mocks.deleteRuntime,
    listRuntimes: mocks.listRuntimes,
    refreshAvailability: mocks.refreshAvailability,
    upsertRuntime: mocks.upsertRuntime,
  },
}));

describe('runtimes router', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.deleteRuntime.mockReset();
    mocks.listRuntimes.mockReset();
    mocks.refreshAvailability.mockReset();
    mocks.upsertRuntime.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function withServer(testFn: (baseUrl: string) => Promise<void>): Promise<void> {
    const { default: router } = await import('./router');
    const app = express();
    app.use(express.json());
    app.use('/api', router);
    app.use(errorHandlerMiddleware);
    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind runtimes router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('refreshes runtime availability and exposes label as name in the listing', async () => {
    mocks.refreshAvailability.mockResolvedValue(undefined);
    mocks.listRuntimes.mockReturnValue([
      {
        key: RUNTIME_KEY,
        label: 'Google Chrome',
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        available: true,
      },
    ]);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/runtimes`);
      const payload = await response.json() as { success: boolean; data: Array<{ name: string }> };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([
        {
          key: RUNTIME_KEY,
          label: 'Google Chrome',
          executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
          available: true,
          name: 'Google Chrome',
        },
      ]);
      expect(mocks.refreshAvailability).toHaveBeenCalledOnce();
    });
  });

  it('returns structured validation details for invalid create and update payloads', async () => {
    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/runtimes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '', label: '', executablePath: '' }),
      });
      const createPayload = await createResponse.json() as {
        code: string;
        details: Array<{ path: string; message: string }>;
        success: boolean;
      };

      expect(createResponse.status).toBe(400);
      expect(createPayload.success).toBe(false);
      expect(createPayload.code).toBe('VALIDATION_ERROR');
      expect(createPayload.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'key' }),
          expect.objectContaining({ path: 'label' }),
          expect.objectContaining({ path: 'executablePath' }),
        ]),
      );

      const updateResponse = await fetch(`${baseUrl}/api/runtimes/${RUNTIME_KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: '' }),
      });
      const updatePayload = await updateResponse.json() as {
        code: string;
        details: Array<{ path: string; message: string }>;
        success: boolean;
      };

      expect(updateResponse.status).toBe(400);
      expect(updatePayload.success).toBe(false);
      expect(updatePayload.code).toBe('VALIDATION_ERROR');
      expect(updatePayload.details).toEqual([
        expect.objectContaining({ path: 'label' }),
        expect.objectContaining({ path: 'executablePath' }),
      ]);
    });
  });

  it('creates, updates, and deletes runtimes through the manager', async () => {
    mocks.upsertRuntime
      .mockResolvedValueOnce({
        key: RUNTIME_KEY,
        label: 'Chrome',
        executablePath: 'C:/chrome.exe',
        available: true,
      })
      .mockResolvedValueOnce({
        key: RUNTIME_KEY,
        label: 'Chrome Canary',
        executablePath: 'C:/chrome-canary.exe',
        available: false,
      });
    mocks.deleteRuntime.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/runtimes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: RUNTIME_KEY,
          label: 'Chrome',
          executablePath: 'C:/chrome.exe',
        }),
      });
      const createPayload = await createResponse.json() as { data: { executablePath: string }; success: boolean };

      expect(createResponse.status).toBe(201);
      expect(createPayload.success).toBe(true);
      expect(createPayload.data.executablePath).toBe('C:/chrome.exe');

      const updateResponse = await fetch(`${baseUrl}/api/runtimes/${RUNTIME_KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Chrome Canary',
          executablePath: 'C:/chrome-canary.exe',
        }),
      });
      const updatePayload = await updateResponse.json() as { data: { label: string }; success: boolean };

      expect(updateResponse.status).toBe(200);
      expect(updatePayload.success).toBe(true);
      expect(updatePayload.data.label).toBe('Chrome Canary');

      const deleteResponse = await fetch(`${baseUrl}/api/runtimes/${RUNTIME_KEY}`, {
        method: 'DELETE',
      });
      const deletePayload = await deleteResponse.json() as { data: null; success: boolean };

      expect(deleteResponse.status).toBe(200);
      expect(deletePayload).toEqual({ success: true, data: null });
      expect(mocks.upsertRuntime).toHaveBeenNthCalledWith(1, RUNTIME_KEY, 'Chrome', 'C:/chrome.exe');
      expect(mocks.upsertRuntime).toHaveBeenNthCalledWith(2, RUNTIME_KEY, 'Chrome Canary', 'C:/chrome-canary.exe');
      expect(mocks.deleteRuntime).toHaveBeenCalledWith(RUNTIME_KEY);
    });
  });

  it('maps runtime deletion errors to the correct HTTP status', async () => {
    const { NotFoundError } = await import('../../core/errors');
    mocks.deleteRuntime.mockRejectedValue(new NotFoundError('Runtime', RUNTIME_KEY));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/runtimes/${RUNTIME_KEY}`, {
        method: 'DELETE',
      });
      const payload = await response.json() as { error: string; success: boolean };

      expect(response.status).toBe(404);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe(`Runtime not found: ${RUNTIME_KEY}`);
    });
  });
});
