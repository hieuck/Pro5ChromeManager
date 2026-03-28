import express from 'express';
import http from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  configGet: vi.fn(),
  configUpdate: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('./ConfigManager', async () => {
  const actual = await vi.importActual<typeof import('./ConfigManager')>('./ConfigManager');
  return {
    ...actual,
    configManager: {
      get: mocks.configGet,
      update: mocks.configUpdate,
    },
  };
});

vi.mock('../../core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('config router', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.configGet.mockReset();
    mocks.configUpdate.mockReset();
    mocks.loggerError.mockReset();

    mocks.configGet.mockReturnValue({
      configVersion: 1,
      onboardingCompleted: false,
      uiLanguage: 'vi',
      locale: 'vi-VN',
      timezoneId: 'Asia/Saigon',
      defaultRuntime: 'auto',
      headless: false,
      windowTitleSuffixEnabled: true,
      profilesDir: 'E:/profiles',
      api: { host: '127.0.0.1', port: 3210 },
      sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
      runtimes: {},
    });
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
        throw new Error('Failed to bind config router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('returns the current config through the success envelope', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/config`);
      const payload = await response.json() as { data: { locale: string }; success: boolean };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.locale).toBe('vi-VN');
    });
  });

  it('returns structured validation details for invalid config payloads', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api: {
            port: 70000,
          },
          unknownField: true,
        }),
      });
      const payload = await response.json() as {
        code: string;
        details: Array<{ path: string; message: string }>;
        error: string;
        success: boolean;
      };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Invalid config payload');
      expect(payload.code).toBe('VALIDATION_ERROR');
      expect(payload.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'api.port' }),
          expect.objectContaining({ path: '' }),
        ]),
      );
    });
  });

  it('updates config successfully when the payload is valid', async () => {
    mocks.configUpdate.mockResolvedValue({
      ...mocks.configGet(),
      locale: 'en-US',
      uiLanguage: 'en',
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: 'en-US',
          uiLanguage: 'en',
        }),
      });
      const payload = await response.json() as { data: { locale: string }; success: boolean };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.locale).toBe('en-US');
      expect(mocks.configUpdate).toHaveBeenCalledWith({
        locale: 'en-US',
        uiLanguage: 'en',
      });
    });
  });

  it('maps Zod validation failures from the manager into a structured response', async () => {
    mocks.configUpdate.mockRejectedValue(new z.ZodError([
      {
        code: 'custom',
        message: 'Timeout must be positive',
        path: ['sessionCheck', 'timeoutMs'],
      },
    ]));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCheck: {
            timeoutMs: 1,
          },
        }),
      });
      const payload = await response.json() as {
        code: string;
        details: Array<{ path: string; message: string }>;
        error: string;
        success: boolean;
      };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Validation failed');
      expect(payload.code).toBe('VALIDATION_ERROR');
      expect(payload.details).toEqual([
        {
          path: 'sessionCheck.timeoutMs',
          message: 'Timeout must be positive',
        },
      ]);
      expect(mocks.loggerError).toHaveBeenCalledWith('Failed to update config', {
        error: 'Validation failed',
      });
    });
  });

  it('propagates non-validation manager errors with the mapped status code', async () => {
    const { ValidationError } = await import('../../core/errors');
    mocks.configUpdate.mockRejectedValue(new ValidationError('Profiles directory is invalid'));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profilesDir: '../outside',
        }),
      });
      const payload = await response.json() as { error: string; success: boolean };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Profiles directory is invalid');
      expect(mocks.loggerError).toHaveBeenCalledWith('Failed to update config', {
        error: 'Profiles directory is invalid',
      });
    });
  });
});
