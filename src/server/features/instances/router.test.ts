import express from 'express';
import http from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  generateCorrelationId: vi.fn(() => 'corr-instances-router'),
  getStatus: vi.fn(),
  launchInstance: vi.fn(),
  listInstances: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  sessionCheck: vi.fn(),
  stopAll: vi.fn(),
  stopInstance: vi.fn(),
}));

vi.mock('./InstanceManager', () => ({
  instanceManager: {
    getStatus: mocks.getStatus,
    launchInstance: mocks.launchInstance,
    listInstances: mocks.listInstances,
    sessionCheck: mocks.sessionCheck,
    stopAll: mocks.stopAll,
    stopInstance: mocks.stopInstance,
  },
}));

vi.mock('../../core/logging/LoggerService', () => ({
  loggerService: {
    error: mocks.loggerError,
    generateCorrelationId: mocks.generateCorrelationId,
    warn: mocks.loggerWarn,
  },
}));

describe('instances router', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.generateCorrelationId.mockClear();
    mocks.getStatus.mockReset();
    mocks.launchInstance.mockReset();
    mocks.listInstances.mockReset();
    mocks.loggerError.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.sessionCheck.mockReset();
    mocks.stopAll.mockReset();
    mocks.stopInstance.mockReset();
  });

  async function withServer(testFn: (baseUrl: string) => Promise<void>): Promise<void> {
    const { default: router } = await import('./router');
    const { errorHandlerMiddleware } = await import('../../core/logging/errorHandler');
    const app = express();
    app.use((req, res, next) => {
      req.correlationId = 'corr-instances-router';
      res.locals.correlationId = 'corr-instances-router';
      next();
    });
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
        throw new Error('Failed to bind instances router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('starts profiles, lists instances, and returns profile status', async () => {
    mocks.launchInstance.mockResolvedValue({ id: 'instance-1', profileId: PROFILE_ID, status: 'running' });
    mocks.listInstances.mockReturnValue([{ id: 'instance-1', profileId: PROFILE_ID, status: 'running' }]);
    mocks.getStatus.mockReturnValue('running');

    await withServer(async (baseUrl) => {
      const startResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/start`, {
        method: 'POST',
      });
      const startPayload = await startResponse.json() as { data: { profileId: string }; success: boolean };

      expect(startResponse.status).toBe(201);
      expect(startPayload.success).toBe(true);
      expect(startPayload.data.profileId).toBe(PROFILE_ID);

      const instancesResponse = await fetch(`${baseUrl}/api/instances`);
      const instancesPayload = await instancesResponse.json() as { data: unknown[]; success: boolean };

      expect(instancesResponse.status).toBe(200);
      expect(instancesPayload.success).toBe(true);
      expect(instancesPayload.data).toHaveLength(1);

      const statusResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/status`);
      const statusPayload = await statusResponse.json() as { data: { status: string }; success: boolean };

      expect(statusResponse.status).toBe(200);
      expect(statusPayload).toEqual({
        success: true,
        data: { status: 'running' },
      });
    });
  });

  it('restarts running profiles by stopping first and then launching again', async () => {
    mocks.getStatus.mockReturnValue('running');
    mocks.stopInstance.mockResolvedValue(undefined);
    mocks.launchInstance.mockResolvedValue({ id: 'instance-2', profileId: PROFILE_ID, status: 'running' });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/restart`, {
        method: 'POST',
      });
      const payload = await response.json() as { data: { id: string }; success: boolean };

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(payload.data.id).toBe('instance-2');
      expect(mocks.stopInstance).toHaveBeenCalledWith(PROFILE_ID);
      expect(mocks.launchInstance).toHaveBeenCalledWith(PROFILE_ID);
    });
  });

  it('skips the stop step when restarting a profile that is not running', async () => {
    mocks.getStatus.mockReturnValue('not_running');
    mocks.launchInstance.mockResolvedValue({ id: 'instance-3', profileId: PROFILE_ID, status: 'running' });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/restart`, {
        method: 'POST',
      });

      expect(response.status).toBe(201);
      expect(mocks.stopInstance).not.toHaveBeenCalled();
      expect(mocks.launchInstance).toHaveBeenCalledWith(PROFILE_ID);
    });
  });

  it('stops a single profile and stops all instances', async () => {
    mocks.stopInstance.mockResolvedValue(undefined);
    mocks.stopAll.mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const stopResponse = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/stop`, {
        method: 'POST',
      });
      const stopPayload = await stopResponse.json() as { data: null; success: boolean };

      expect(stopResponse.status).toBe(200);
      expect(stopPayload).toEqual({ success: true, data: null });
      expect(mocks.stopInstance).toHaveBeenCalledWith(PROFILE_ID);

      const stopAllResponse = await fetch(`${baseUrl}/api/instances/stop-all`, {
        method: 'POST',
      });
      const stopAllPayload = await stopAllResponse.json() as { data: null; success: boolean };

      expect(stopAllResponse.status).toBe(200);
      expect(stopAllPayload).toEqual({ success: true, data: null });
      expect(mocks.stopAll).toHaveBeenCalledOnce();
    });
  });

  it('rejects invalid session-check payloads through the shared error middleware', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/session-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      });
      const payload = await response.json() as { code: string; error: string; success: boolean };

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(payload.code).toBe('VALIDATION_ERROR');
      expect(payload.error).toBe('Invalid request body');
      expect(mocks.loggerWarn).toHaveBeenCalledWith('Operational error', {
        correlationId: 'corr-instances-router',
        error: 'Invalid request body',
      });
    });
  });

  it('runs a valid session check and returns the manager result', async () => {
    mocks.sessionCheck.mockResolvedValue({
      authenticated: true,
      checkedUrl: 'https://example.com/account',
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profiles/${PROFILE_ID}/session-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/account' }),
      });
      const payload = await response.json() as { data: { authenticated: boolean }; success: boolean };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.authenticated).toBe(true);
      expect(mocks.sessionCheck).toHaveBeenCalledWith(PROFILE_ID, 'https://example.com/account');
    });
  });
});
