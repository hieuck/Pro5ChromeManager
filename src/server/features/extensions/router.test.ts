import express from 'express';
import http from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EXTENSION_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  addExtension: vi.fn(),
  deleteExtension: vi.fn(),
  listBundles: vi.fn(),
  listExtensions: vi.fn(),
  loggerError: vi.fn(),
  updateExtension: vi.fn(),
}));

vi.mock('./ExtensionManager', () => ({
  extensionManager: {
    addExtension: mocks.addExtension,
    deleteExtension: mocks.deleteExtension,
    listBundles: mocks.listBundles,
    listExtensions: mocks.listExtensions,
    updateExtension: mocks.updateExtension,
  },
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('extensions router', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.addExtension.mockReset();
    mocks.deleteExtension.mockReset();
    mocks.listBundles.mockReset();
    mocks.listExtensions.mockReset();
    mocks.loggerError.mockReset();
    mocks.updateExtension.mockReset();
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
        throw new Error('Failed to bind extensions router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('lists extensions and bundles through the success envelope', async () => {
    mocks.listExtensions.mockReturnValue([
      { id: EXTENSION_ID, name: 'uBlock', enabled: true },
    ]);
    mocks.listBundles.mockReturnValue([
      { key: 'privacy', label: 'privacy', extensionIds: [EXTENSION_ID], extensionCount: 1 },
    ]);

    await withServer(async (baseUrl) => {
      const extensionsResponse = await fetch(`${baseUrl}/api/extensions`);
      const extensionsPayload = await extensionsResponse.json() as { data: Array<{ id: string }>; success: boolean };
      expect(extensionsResponse.status).toBe(200);
      expect(extensionsPayload.data[0]?.id).toBe(EXTENSION_ID);

      const bundlesResponse = await fetch(`${baseUrl}/api/extensions/bundles`);
      const bundlesPayload = await bundlesResponse.json() as { data: Array<{ key: string }>; success: boolean };
      expect(bundlesResponse.status).toBe(200);
      expect(bundlesPayload.data[0]?.key).toBe('privacy');
    });
  });

  it('creates, updates, and deletes extensions', async () => {
    mocks.addExtension.mockResolvedValue({
      id: EXTENSION_ID,
      name: 'uBlock',
      sourcePath: 'E:/Downloads/ublock.zip',
    });
    mocks.updateExtension.mockResolvedValue({
      id: EXTENSION_ID,
      name: 'uBlock Origin',
      category: 'privacy',
    });
    mocks.deleteExtension.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: 'E:/Downloads/ublock.zip',
          category: 'privacy',
        }),
      });
      const createPayload = await createResponse.json() as { data: { id: string }; success: boolean };
      expect(createResponse.status).toBe(201);
      expect(createPayload.data.id).toBe(EXTENSION_ID);
      expect(mocks.addExtension).toHaveBeenCalledWith({
        sourcePath: 'E:/Downloads/ublock.zip',
        category: 'privacy',
      });

      const updateResponse = await fetch(`${baseUrl}/api/extensions/${EXTENSION_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'uBlock Origin',
          enabled: true,
        }),
      });
      const updatePayload = await updateResponse.json() as { data: { name: string }; success: boolean };
      expect(updateResponse.status).toBe(200);
      expect(updatePayload.data.name).toBe('uBlock Origin');
      expect(mocks.updateExtension).toHaveBeenCalledWith(EXTENSION_ID, {
        name: 'uBlock Origin',
        enabled: true,
      });

      const deleteResponse = await fetch(`${baseUrl}/api/extensions/${EXTENSION_ID}`, {
        method: 'DELETE',
      });
      const deletePayload = await deleteResponse.json() as { data: null; success: boolean };
      expect(deleteResponse.status).toBe(200);
      expect(deletePayload).toEqual({ success: true, data: null });
      expect(mocks.deleteExtension).toHaveBeenCalledWith(EXTENSION_ID);
    });
  });

  it('maps validation and manager errors for each route', async () => {
    const { ConflictError, NotFoundError } = await import('../../core/errors');
    mocks.listExtensions.mockImplementation(() => {
      throw new Error('list failed');
    });
    mocks.listBundles.mockImplementation(() => {
      throw new Error('bundle failed');
    });
    mocks.addExtension.mockRejectedValueOnce(new ConflictError('Extension already added'));
    mocks.updateExtension.mockRejectedValueOnce(new NotFoundError('Extension', EXTENSION_ID));
    mocks.deleteExtension.mockRejectedValueOnce(new NotFoundError('Extension', EXTENSION_ID));

    await withServer(async (baseUrl) => {
      const listResponse = await fetch(`${baseUrl}/api/extensions`);
      expect(listResponse.status).toBe(500);

      const bundlesResponse = await fetch(`${baseUrl}/api/extensions/bundles`);
      expect(bundlesResponse.status).toBe(500);

      const invalidCreateResponse = await fetch(`${baseUrl}/api/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '',
        }),
      });
      expect(invalidCreateResponse.status).toBe(400);

      const conflictCreateResponse = await fetch(`${baseUrl}/api/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: 'E:/Downloads/ublock.zip',
        }),
      });
      const conflictCreatePayload = await conflictCreateResponse.json() as { error: string; success: boolean };
      expect(conflictCreateResponse.status).toBe(409);
      expect(conflictCreatePayload.error).toBe('Extension already added');

      const invalidUpdateResponse = await fetch(`${baseUrl}/api/extensions/${EXTENSION_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: 'yes',
        }),
      });
      expect(invalidUpdateResponse.status).toBe(400);

      const missingUpdateResponse = await fetch(`${baseUrl}/api/extensions/${EXTENSION_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
        }),
      });
      const missingUpdatePayload = await missingUpdateResponse.json() as { error: string; success: boolean };
      expect(missingUpdateResponse.status).toBe(404);
      expect(missingUpdatePayload.error).toBe(`Extension not found: ${EXTENSION_ID}`);

      const missingDeleteResponse = await fetch(`${baseUrl}/api/extensions/${EXTENSION_ID}`, {
        method: 'DELETE',
      });
      const missingDeletePayload = await missingDeleteResponse.json() as { error: string; success: boolean };
      expect(missingDeleteResponse.status).toBe(404);
      expect(missingDeletePayload.error).toBe(`Extension not found: ${EXTENSION_ID}`);

      expect(mocks.loggerError.mock.calls).toEqual(
        expect.arrayContaining([
          ['GET /api/extensions error', { error: 'Internal server error' }],
          ['GET /api/extensions/bundles error', { error: 'Internal server error' }],
          ['POST /api/extensions error', { error: 'Validation failed' }],
          ['POST /api/extensions error', { error: 'Extension already added' }],
          ['PUT /api/extensions/:id error', { error: 'Validation failed' }],
          ['PUT /api/extensions/:id error', { error: `Extension not found: ${EXTENSION_ID}` }],
          ['DELETE /api/extensions/:id error', { error: `Extension not found: ${EXTENSION_ID}` }],
        ]),
      );
    });
  });
});
