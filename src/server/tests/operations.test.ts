import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';

describe('Operations endpoints', () => {
  let tmpDir: string;
  let baseUrl: string;
  let server: http.Server;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-ops-test-'));
    process.env['DATA_DIR'] = tmpDir;
    process.env['NODE_ENV'] = 'test';
    process.env['PRO5_SERVER_AUTOSTART'] = 'false';
    process.env['PRO5_OFFLINE_SECRET'] = 'test-offline-secret';

    const { configManager } = await import('../managers/ConfigManager');
    await configManager.load();
    await configManager.update({
      profilesDir: path.join(tmpDir, 'profiles'),
      api: { host: '127.0.0.1', port: 3210 },
      runtimes: {
        smoke: {
          label: 'Smoke Runtime',
          executablePath: process.execPath,
        },
      },
    });

    const { fingerprintEngine } = await import('../managers/FingerprintEngine');
    await fingerprintEngine.initialize();

    const { runtimeManager } = await import('../managers/RuntimeManager');
    await runtimeManager.initialize();

    const { profileManager } = await import('../managers/ProfileManager');
    await profileManager.initialize();

    const { proxyManager } = await import('../managers/ProxyManager');
    await proxyManager.initialize();

    const { licenseManager } = await import('../managers/LicenseManager');
    await licenseManager.initialize();

    const { app } = await import('../index');
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env['DATA_DIR'];
    delete process.env['PRO5_OFFLINE_SECRET'];
    delete process.env['PRO5_SERVER_AUTOSTART'];
  });

  it('serves health and readiness endpoints', async () => {
    const healthRes = await fetch(`${baseUrl}/health`);
    expect(healthRes.status).toBe(200);
    const health = await healthRes.json() as { status: string; version: string };
    expect(health.status).toBe('ok');
    expect(health.version).toBeTruthy();

    const readyRes = await fetch(`${baseUrl}/readyz`);
    expect(readyRes.status).toBe(200);
    const ready = await readyRes.json() as {
      status: string;
      availableRuntimeCount: number;
      warnings: string[];
    };
    expect(ready.status).toBe('ready');
    expect(ready.availableRuntimeCount).toBeGreaterThan(0);
    expect(ready.warnings).toEqual([]);
  });

  it('exposes support status and self-test results', async () => {
    const statusRes = await fetch(`${baseUrl}/api/support/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as {
      success: boolean;
      data: {
        diagnosticsReady: boolean;
        supportPagesReady: boolean;
        releaseReady: boolean;
        recentIncidentCount: number;
        recentErrorCount: number;
        lastIncidentAt: string | null;
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.diagnosticsReady).toBe(true);
    expect(statusJson.data.supportPagesReady).toBe(true);
    expect(statusJson.data.releaseReady).toBe(true);
    expect(statusJson.data.recentIncidentCount).toBeGreaterThanOrEqual(0);
    expect(statusJson.data.recentErrorCount).toBeGreaterThanOrEqual(0);
    expect(statusJson.data.recentErrorCount).toBeLessThanOrEqual(statusJson.data.recentIncidentCount);
    if (statusJson.data.recentIncidentCount === 0) {
      expect(statusJson.data.lastIncidentAt).toBeNull();
    } else {
      expect(statusJson.data.lastIncidentAt).toBeTruthy();
    }

    const selfTestRes = await fetch(`${baseUrl}/api/support/self-test`, { method: 'POST' });
    expect(selfTestRes.status).toBe(200);
    const selfTestJson = await selfTestRes.json() as {
      success: boolean;
      data: {
        status: 'pass' | 'warn' | 'fail';
        checks: Array<{ key: string; status: 'pass' | 'warn' | 'fail' }>;
      };
    };
    expect(selfTestJson.success).toBe(true);
    expect(selfTestJson.data.status).toBe('pass');
    expect(selfTestJson.data.checks.some((check) => check.key === 'runtime' && check.status === 'pass')).toBe(true);
    expect(selfTestJson.data.checks.some((check) => check.key === 'diagnostics' && check.status === 'pass')).toBe(true);
  });

  it('returns recent incident summaries', async () => {
    await fs.mkdir(path.join(tmpDir, 'logs'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'logs', 'electron-main.log'),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Renderer failed to load URL',
        meta: { errorCode: -102 },
      })}\n`,
      'utf-8',
    );

    const incidentsRes = await fetch(`${baseUrl}/api/support/incidents?limit=5`);
    expect(incidentsRes.status).toBe(200);
    const incidentsJson = await incidentsRes.json() as {
      success: boolean;
      data: { count: number; incidents: Array<{ source: string; level: string; message: string }> };
    };
    expect(incidentsJson.success).toBe(true);
    expect(incidentsJson.data.count).toBeGreaterThan(0);
    expect(incidentsJson.data.incidents.some((incident) =>
      incident.source === 'electron-main.log' &&
      incident.level === 'error' &&
      incident.message === 'Renderer failed to load URL')).toBe(true);

    const statusRes = await fetch(`${baseUrl}/api/support/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as {
      success: boolean;
      data: {
        recentIncidentCount: number;
        recentErrorCount: number;
        lastIncidentAt: string | null;
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.recentIncidentCount).toBeGreaterThan(0);
    expect(statusJson.data.recentErrorCount).toBeGreaterThan(0);
    expect(statusJson.data.lastIncidentAt).toBeTruthy();
  });
});
