import fs from 'node:fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildIncidentSnapshot: vi.fn(),
  buildSupportSelfTest: vi.fn(),
  buildSupportStatus: vi.fn(),
  createDiagnosticsArchive: vi.fn(),
  createFeedback: vi.fn(),
  listFeedback: vi.fn(),
  loadIncidentEntries: vi.fn(),
  loggerError: vi.fn(),
  onboardingUpdate: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    default: {
      ...actual,
      unlink: mocks.unlink,
    },
    unlink: mocks.unlink,
  };
});

vi.mock('./supportDiagnostics', () => ({
  buildIncidentSnapshot: mocks.buildIncidentSnapshot,
  loadIncidentEntries: mocks.loadIncidentEntries,
}));

vi.mock('./supportStatus', () => ({
  buildSupportSelfTest: mocks.buildSupportSelfTest,
  buildSupportStatus: mocks.buildSupportStatus,
}));

vi.mock('./supportDiagnosticsExport', () => ({
  createDiagnosticsArchive: mocks.createDiagnosticsArchive,
}));

vi.mock('./OnboardingStateManager', () => ({
  onboardingStateManager: {
    update: mocks.onboardingUpdate,
  },
}));

vi.mock('./SupportInboxManager', () => ({
  supportInboxManager: {
    createFeedback: mocks.createFeedback,
    listFeedback: mocks.listFeedback,
  },
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('support router', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-support-router-'));
    vi.resetModules();
    mocks.buildIncidentSnapshot.mockReset();
    mocks.buildSupportSelfTest.mockReset();
    mocks.buildSupportStatus.mockReset();
    mocks.createDiagnosticsArchive.mockReset();
    mocks.createFeedback.mockReset();
    mocks.listFeedback.mockReset();
    mocks.loadIncidentEntries.mockReset();
    mocks.loggerError.mockReset();
    mocks.onboardingUpdate.mockReset();
    mocks.unlink.mockReset();
    mocks.unlink.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
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
        throw new Error('Failed to bind support router test server');
      }

      await testFn(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  async function getRouteHandler(routePath: string, method: 'get' | 'post') {
    const { default: router } = await import('./router');
    const layer = router.stack.find((entry) => entry.route?.path === routePath);
    const routeLayer = layer?.route?.stack.find((entry) => entry.method === method);
    if (!routeLayer) {
      throw new Error(`Missing route handler for ${method.toUpperCase()} ${routePath}`);
    }

    return routeLayer.handle as (req: unknown, res: {
      locals: Record<string, unknown>;
      json: (payload: unknown) => unknown;
      sendFile: (filePath: string, callback: (error?: Error) => void) => void;
      setHeader: (name: string, value: string) => void;
      status: (code: number) => unknown;
    }) => Promise<void>;
  }

  it('returns support status and self-test payloads through the success envelope', async () => {
    mocks.buildSupportStatus.mockResolvedValue({ healthy: true });
    mocks.buildSupportSelfTest.mockResolvedValue({ checks: [] });

    await withServer(async (baseUrl) => {
      const statusResponse = await fetch(`${baseUrl}/api/support/status`);
      const statusPayload = await statusResponse.json() as { data: { healthy: boolean }; success: boolean };
      expect(statusResponse.status).toBe(200);
      expect(statusPayload).toEqual({ success: true, data: { healthy: true } });

      const selfTestResponse = await fetch(`${baseUrl}/api/support/self-test`, {
        method: 'POST',
      });
      const selfTestPayload = await selfTestResponse.json() as { data: { checks: unknown[] }; success: boolean };
      expect(selfTestResponse.status).toBe(200);
      expect(selfTestPayload).toEqual({ success: true, data: { checks: [] } });
    });
  });

  it('parses incident and feedback list limits with defaults and clamping', async () => {
    mocks.loadIncidentEntries.mockResolvedValue([{ id: 'incident-1' }]);
    mocks.buildIncidentSnapshot.mockReturnValue({ total: 1 });
    mocks.listFeedback.mockResolvedValue([{ id: 'feedback-1' }]);

    await withServer(async (baseUrl) => {
      const incidentsResponse = await fetch(`${baseUrl}/api/support/incidents?limit=999`);
      const incidentsPayload = await incidentsResponse.json() as { data: { total: number }; success: boolean };
      expect(incidentsResponse.status).toBe(200);
      expect(incidentsPayload).toEqual({ success: true, data: { total: 1 } });
      expect(mocks.loadIncidentEntries).toHaveBeenCalledWith(100);

      const feedbackResponse = await fetch(`${baseUrl}/api/support/feedback?limit=invalid`);
      const feedbackPayload = await feedbackResponse.json() as {
        data: { count: number; entries: Array<{ id: string }> };
        success: boolean;
      };
      expect(feedbackResponse.status).toBe(200);
      expect(feedbackPayload.data.count).toBe(1);
      expect(feedbackPayload.data.entries[0]?.id).toBe('feedback-1');
      expect(mocks.listFeedback).toHaveBeenCalledWith(20);
    });
  });

  it('updates onboarding state and validates malformed payloads', async () => {
    mocks.onboardingUpdate.mockResolvedValue({
      status: 'in_progress',
      currentStep: 2,
    });

    await withServer(async (baseUrl) => {
      const invalidResponse = await fetch(`${baseUrl}/api/support/onboarding-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep: 999,
        }),
      });
      const invalidPayload = await invalidResponse.json() as { error: string; success: boolean };
      expect(invalidResponse.status).toBe(400);
      expect(invalidPayload).toEqual(expect.objectContaining({
        success: false,
        error: 'Invalid onboarding state payload',
      }));

      const successResponse = await fetch(`${baseUrl}/api/support/onboarding-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          currentStep: 2,
          selectedRuntime: 'chrome',
        }),
      });
      const successPayload = await successResponse.json() as {
        data: { currentStep: number; status: string };
        success: boolean;
      };

      expect(successResponse.status).toBe(200);
      expect(successPayload.success).toBe(true);
      expect(successPayload.data.currentStep).toBe(2);
      expect(mocks.onboardingUpdate).toHaveBeenCalledWith({
        status: 'in_progress',
        currentStep: 2,
        selectedRuntime: 'chrome',
      });
    });
  });

  it('creates feedback entries, normalizes nullish optional fields, and validates malformed payloads', async () => {
    mocks.createFeedback.mockResolvedValue({
      id: 'feedback-1',
      category: 'bug',
      sentiment: 'negative',
      message: 'Login form is broken on first launch',
      email: null,
      appVersion: null,
    });

    await withServer(async (baseUrl) => {
      const invalidResponse = await fetch(`${baseUrl}/api/support/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'bug',
          sentiment: 'negative',
          message: 'short',
        }),
      });
      const invalidPayload = await invalidResponse.json() as { error: string; success: boolean };
      expect(invalidResponse.status).toBe(400);
      expect(invalidPayload).toEqual(expect.objectContaining({
        success: false,
        error: 'Invalid feedback payload',
      }));

      const successResponse = await fetch(`${baseUrl}/api/support/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'bug',
          sentiment: 'negative',
          message: 'Login form is broken on first launch',
        }),
      });
      const successPayload = await successResponse.json() as {
        data: { id: string };
        success: boolean;
      };

      expect(successResponse.status).toBe(201);
      expect(successPayload.success).toBe(true);
      expect(successPayload.data.id).toBe('feedback-1');
      expect(mocks.createFeedback).toHaveBeenCalledWith({
        category: 'bug',
        sentiment: 'negative',
        message: 'Login form is broken on first launch',
        email: null,
        appVersion: null,
      });
    });
  });

  it('streams diagnostics archives with the expected download headers and cleanup callback', async () => {
    const archivePath = path.join(tempDir, 'diagnostics.zip');
    await fs.writeFile(archivePath, 'zip-data', 'utf-8');
    mocks.createDiagnosticsArchive.mockResolvedValue(archivePath);

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/support/diagnostics`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/zip');
      expect(response.headers.get('content-disposition')).toContain('pro5-diagnostics.zip');
      expect(await response.text()).toBe('zip-data');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.unlink).toHaveBeenCalledWith(archivePath);
    });
  });

  it('maps support route failures to error responses', async () => {
    const { ValidationError } = await import('../../core/errors');
    mocks.buildSupportStatus.mockRejectedValue(new Error('status failed'));
    mocks.loadIncidentEntries.mockRejectedValue(new Error('incidents failed'));
    mocks.buildSupportSelfTest.mockRejectedValue(new Error('self test failed'));
    mocks.onboardingUpdate.mockRejectedValue(new ValidationError('State update failed'));
    mocks.listFeedback.mockRejectedValue(new Error('feedback list failed'));
    mocks.createFeedback.mockRejectedValue(new Error('feedback create failed'));
    mocks.createDiagnosticsArchive.mockRejectedValue(new Error('archive failed'));

    await withServer(async (baseUrl) => {
      const statusResponse = await fetch(`${baseUrl}/api/support/status`);
      const statusPayload = await statusResponse.json() as { error: string; success: boolean };
      expect(statusResponse.status).toBe(500);
      expect(statusPayload.error).toBe('Internal server error');

      const incidentsResponse = await fetch(`${baseUrl}/api/support/incidents`);
      const incidentsPayload = await incidentsResponse.json() as { error: string; success: boolean };
      expect(incidentsResponse.status).toBe(500);
      expect(incidentsPayload.error).toBe('Internal server error');

      const selfTestResponse = await fetch(`${baseUrl}/api/support/self-test`, { method: 'POST' });
      const selfTestPayload = await selfTestResponse.json() as { error: string; success: boolean };
      expect(selfTestResponse.status).toBe(500);
      expect(selfTestPayload.error).toBe('Internal server error');

      const onboardingResponse = await fetch(`${baseUrl}/api/support/onboarding-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          currentStep: 3,
        }),
      });
      const onboardingPayload = await onboardingResponse.json() as { error: string; success: boolean };
      expect(onboardingResponse.status).toBe(400);
      expect(onboardingPayload.error).toBe('State update failed');

      const feedbackListResponse = await fetch(`${baseUrl}/api/support/feedback`);
      const feedbackListPayload = await feedbackListResponse.json() as { error: string; success: boolean };
      expect(feedbackListResponse.status).toBe(500);
      expect(feedbackListPayload.error).toBe('Internal server error');

      const feedbackCreateResponse = await fetch(`${baseUrl}/api/support/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'question',
          sentiment: 'neutral',
          message: 'Need help exporting the diagnostics bundle cleanly',
          email: '',
          appVersion: '',
        }),
      });
      const feedbackCreatePayload = await feedbackCreateResponse.json() as { error: string; success: boolean };
      expect(feedbackCreateResponse.status).toBe(500);
      expect(feedbackCreatePayload.error).toBe('Internal server error');

      const archiveErrorResponse = await fetch(`${baseUrl}/api/support/diagnostics`);
      const archiveErrorPayload = await archiveErrorResponse.json() as { error: string; success: boolean };
      expect(archiveErrorResponse.status).toBe(500);
      expect(archiveErrorPayload.error).toBe('Internal server error');

      expect(mocks.loggerError.mock.calls).toEqual(
        expect.arrayContaining([
          ['GET /api/support/status error', { error: 'Internal server error' }],
          ['GET /api/support/incidents error', { error: 'Internal server error' }],
          ['POST /api/support/self-test error', { error: 'Internal server error' }],
          ['POST /api/support/onboarding-state error', { error: 'State update failed' }],
          ['GET /api/support/feedback error', { error: 'Internal server error' }],
          ['POST /api/support/feedback error', { error: 'Internal server error' }],
          ['GET /api/support/diagnostics error', { error: 'Internal server error' }],
        ]),
      );
    });
  });

  it('logs diagnostics send-file callback failures and still schedules cleanup', async () => {
    const archivePath = path.join(tempDir, 'missing.zip');
    mocks.createDiagnosticsArchive.mockResolvedValue(archivePath);
    const handler = await getRouteHandler('/support/diagnostics', 'get');
    const response = {
      locals: {},
      json: vi.fn(),
      sendFile: vi.fn((_filePath: string, callback: (error?: Error) => void) => {
        callback(new Error('ENOENT: missing archive'));
      }),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    await handler({}, response);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.setHeader).toHaveBeenNthCalledWith(1, 'Content-Type', 'application/zip');
    expect(response.setHeader).toHaveBeenNthCalledWith(
      2,
      'Content-Disposition',
      'attachment; filename="pro5-diagnostics.zip"',
    );
    expect(response.sendFile).toHaveBeenCalledWith(archivePath, expect.any(Function));
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'GET /api/support/diagnostics sendFile error',
      { error: 'ENOENT: missing archive' },
    );
    expect(mocks.unlink).toHaveBeenCalledWith(archivePath);
  });
});
