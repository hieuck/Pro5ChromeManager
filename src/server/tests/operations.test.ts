import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';

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

  it('serves the bundled UI shell', async () => {
    const uiRes = await fetch(`${baseUrl}/ui/`);
    expect(uiRes.status).toBe(200);
    const html = await uiRes.text();
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('<div id="root"></div>');
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
        onboardingCompleted: boolean;
        onboardingState: {
          status: string;
          currentStep: number;
          selectedRuntime: string | null;
          draftProfileName: string | null;
          lastOpenedAt: string | null;
          profileCreatedAt: string | null;
        };
        profileCount: number;
        proxyCount: number;
        backupCount: number;
        feedbackCount: number;
        lastFeedbackAt: string | null;
        usageMetrics: {
          profileCreates: number;
          profileImports: number;
          profileLaunches: number;
          sessionChecks: number;
          sessionCheckLoggedIn: number;
          sessionCheckLoggedOut: number;
          sessionCheckErrors: number;
          lastProfileCreatedAt: string | null;
          lastProfileImportedAt: string | null;
          lastProfileLaunchAt: string | null;
          lastSessionCheckAt: string | null;
        };
        recentIncidentCount: number;
        recentErrorCount: number;
        lastIncidentAt: string | null;
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.diagnosticsReady).toBe(true);
    expect(statusJson.data.supportPagesReady).toBe(true);
    expect(statusJson.data.releaseReady).toBe(true);
    expect(statusJson.data.onboardingCompleted).toBe(false);
    expect(statusJson.data.onboardingState.status).toBe('not_started');
    expect(statusJson.data.onboardingState.currentStep).toBe(0);
    expect(statusJson.data.onboardingState.selectedRuntime).toBeNull();
    expect(statusJson.data.onboardingState.draftProfileName).toBeNull();
    expect(statusJson.data.onboardingState.lastOpenedAt).toBeNull();
    expect(statusJson.data.onboardingState.profileCreatedAt).toBeNull();
    expect(statusJson.data.profileCount).toBe(0);
    expect(statusJson.data.proxyCount).toBe(0);
    expect(statusJson.data.backupCount).toBe(0);
    expect(statusJson.data.feedbackCount).toBe(0);
    expect(statusJson.data.lastFeedbackAt).toBeNull();
    expect(statusJson.data.usageMetrics.profileCreates).toBe(0);
    expect(statusJson.data.usageMetrics.profileImports).toBe(0);
    expect(statusJson.data.usageMetrics.profileLaunches).toBe(0);
    expect(statusJson.data.usageMetrics.sessionChecks).toBe(0);
    expect(statusJson.data.usageMetrics.lastProfileCreatedAt).toBeNull();
    expect(statusJson.data.usageMetrics.lastProfileImportedAt).toBeNull();
    expect(statusJson.data.usageMetrics.lastProfileLaunchAt).toBeNull();
    expect(statusJson.data.usageMetrics.lastSessionCheckAt).toBeNull();
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

  it('includes usage metrics snapshots in support status', async () => {
    const { usageMetricsManager } = await import('../managers/UsageMetricsManager');
    await usageMetricsManager.recordProfileCreated();
    await usageMetricsManager.recordProfileImported();
    await usageMetricsManager.recordProfileLaunch();
    await usageMetricsManager.recordSessionCheck('logged_in');
    await usageMetricsManager.recordSessionCheck('logged_out');
    await usageMetricsManager.recordSessionCheck('error');

    const statusRes = await fetch(`${baseUrl}/api/support/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as {
      success: boolean;
      data: {
        usageMetrics: {
          profileCreates: number;
          profileImports: number;
          profileLaunches: number;
          sessionChecks: number;
          sessionCheckLoggedIn: number;
          sessionCheckLoggedOut: number;
          sessionCheckErrors: number;
          lastProfileCreatedAt: string | null;
          lastProfileImportedAt: string | null;
          lastProfileLaunchAt: string | null;
          lastSessionCheckAt: string | null;
        };
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.usageMetrics.profileCreates).toBe(1);
    expect(statusJson.data.usageMetrics.profileImports).toBe(1);
    expect(statusJson.data.usageMetrics.profileLaunches).toBe(1);
    expect(statusJson.data.usageMetrics.sessionChecks).toBe(3);
    expect(statusJson.data.usageMetrics.sessionCheckLoggedIn).toBe(1);
    expect(statusJson.data.usageMetrics.sessionCheckLoggedOut).toBe(1);
    expect(statusJson.data.usageMetrics.sessionCheckErrors).toBe(1);
    expect(statusJson.data.usageMetrics.lastProfileCreatedAt).toBeTruthy();
    expect(statusJson.data.usageMetrics.lastProfileImportedAt).toBeTruthy();
    expect(statusJson.data.usageMetrics.lastProfileLaunchAt).toBeTruthy();
    expect(statusJson.data.usageMetrics.lastSessionCheckAt).toBeTruthy();
  });

  it('persists onboarding state and exposes it in support status', async () => {
    const onboardingRes = await fetch(`${baseUrl}/api/support/onboarding-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'profile_created',
        currentStep: 2,
        selectedRuntime: 'smoke',
        draftProfileName: 'First profile',
        createdProfileId: 'profile-123',
        lastOpenedAt: new Date().toISOString(),
        profileCreatedAt: new Date().toISOString(),
      }),
    });
    expect(onboardingRes.status).toBe(200);

    const statusRes = await fetch(`${baseUrl}/api/support/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as {
      success: boolean;
      data: {
        onboardingState: {
          status: string;
          currentStep: number;
          selectedRuntime: string | null;
          draftProfileName: string | null;
          createdProfileId: string | null;
          lastOpenedAt: string | null;
          profileCreatedAt: string | null;
        };
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.onboardingState.status).toBe('profile_created');
    expect(statusJson.data.onboardingState.currentStep).toBe(2);
    expect(statusJson.data.onboardingState.selectedRuntime).toBe('smoke');
    expect(statusJson.data.onboardingState.draftProfileName).toBe('First profile');
    expect(statusJson.data.onboardingState.createdProfileId).toBe('profile-123');
    expect(statusJson.data.onboardingState.lastOpenedAt).toBeTruthy();
    expect(statusJson.data.onboardingState.profileCreatedAt).toBeTruthy();
  });

  it('accepts support feedback and exposes it in support status', async () => {
    const feedbackRes = await fetch(`${baseUrl}/api/support/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        sentiment: 'negative',
        message: 'The launch flow is confusing when no runtime is configured yet.',
        email: 'tester@example.com',
        appVersion: '1.2.3',
      }),
    });
    expect(feedbackRes.status).toBe(201);
    const feedbackJson = await feedbackRes.json() as {
      success: boolean;
      data: {
        id: string;
        category: string;
        sentiment: string;
        message: string;
        email: string | null;
        appVersion: string | null;
      };
    };
    expect(feedbackJson.success).toBe(true);
    expect(feedbackJson.data.id).toBeTruthy();
    expect(feedbackJson.data.category).toBe('bug');

    const listRes = await fetch(`${baseUrl}/api/support/feedback?limit=5`);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as {
      success: boolean;
      data: {
        count: number;
        entries: Array<{ message: string; email: string | null }>;
      };
    };
    expect(listJson.success).toBe(true);
    expect(listJson.data.count).toBeGreaterThan(0);
    expect(listJson.data.entries.some((entry) =>
      entry.message === 'The launch flow is confusing when no runtime is configured yet.' &&
      entry.email === 'tester@example.com')).toBe(true);

    const statusRes = await fetch(`${baseUrl}/api/support/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as {
      success: boolean;
      data: {
        feedbackCount: number;
        lastFeedbackAt: string | null;
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.feedbackCount).toBeGreaterThan(0);
    expect(statusJson.data.lastFeedbackAt).toBeTruthy();
  });

  it('exports diagnostics bundles with support snapshots', async () => {
    await fs.mkdir(path.join(tmpDir, 'logs'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'logs', 'app-test.log'),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'Test warning for diagnostics export',
      })}\n`,
      'utf-8',
    );

    const diagnosticsRes = await fetch(`${baseUrl}/api/support/diagnostics`);
    expect(diagnosticsRes.status).toBe(200);
    expect(diagnosticsRes.headers.get('content-type')).toContain('application/zip');

    const zipBytes = Buffer.from(await diagnosticsRes.arrayBuffer());
    const zipPath = path.join(tmpDir, 'diagnostics.zip');
    const extractDir = path.join(tmpDir, 'diagnostics-expanded');
    await fs.writeFile(zipPath, zipBytes);
    await fs.rm(extractDir, { recursive: true, force: true });

    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    const summary = JSON.parse(await fs.readFile(path.join(extractDir, 'summary.json'), 'utf-8')) as {
      dataDir: string;
    };
    const supportStatus = JSON.parse(await fs.readFile(path.join(extractDir, 'support-status.json'), 'utf-8')) as {
      diagnosticsReady: boolean;
      onboardingCompleted: boolean;
      onboardingState: {
        status: string;
        currentStep: number;
        selectedRuntime: string | null;
      };
      profileCount: number;
      proxyCount: number;
      backupCount: number;
      usageMetrics: {
        profileCreates: number;
        profileImports: number;
        profileLaunches: number;
        sessionChecks: number;
      };
      recentIncidentCount: number;
    };
    const selfTest = JSON.parse(await fs.readFile(path.join(extractDir, 'self-test.json'), 'utf-8')) as {
      status: 'pass' | 'warn' | 'fail';
      checks: Array<{ key: string }>;
    };
    const incidents = JSON.parse(await fs.readFile(path.join(extractDir, 'incidents.json'), 'utf-8')) as {
      count: number;
      incidents: Array<{ message: string }>;
    };
    const feedbackEntries = JSON.parse(await fs.readFile(path.join(extractDir, 'support-feedback.json'), 'utf-8')) as Array<{
      message: string;
      email: string | null;
    }>;
    const onboardingState = JSON.parse(await fs.readFile(path.join(extractDir, 'onboarding-state.json'), 'utf-8')) as {
      status: string;
      currentStep: number;
      selectedRuntime: string | null;
      createdProfileId: string | null;
    };

    expect(summary.dataDir).toBe(tmpDir);
    expect(supportStatus.diagnosticsReady).toBe(true);
    expect(supportStatus.onboardingCompleted).toBe(false);
    expect(supportStatus.onboardingState.status).toBe('profile_created');
    expect(supportStatus.onboardingState.currentStep).toBe(2);
    expect(supportStatus.onboardingState.selectedRuntime).toBe('smoke');
    expect(supportStatus.profileCount).toBe(0);
    expect(supportStatus.proxyCount).toBe(0);
    expect(supportStatus.backupCount).toBe(0);
    expect(supportStatus.usageMetrics.profileCreates).toBe(1);
    expect(supportStatus.usageMetrics.profileImports).toBe(1);
    expect(supportStatus.usageMetrics.profileLaunches).toBe(1);
    expect(supportStatus.usageMetrics.sessionChecks).toBe(3);
    expect(supportStatus.recentIncidentCount).toBeGreaterThan(0);
    expect(selfTest.status).toBe('pass');
    expect(selfTest.checks.some((check) => check.key === 'diagnostics')).toBe(true);
    expect(incidents.count).toBeGreaterThan(0);
    expect(incidents.incidents.some((incident) => incident.message === 'Test warning for diagnostics export')).toBe(true);
    expect(feedbackEntries.some((entry) =>
      entry.message === 'The launch flow is confusing when no runtime is configured yet.' &&
      entry.email === 'tester@example.com')).toBe(true);
    expect(onboardingState.status).toBe('profile_created');
    expect(onboardingState.currentStep).toBe(2);
    expect(onboardingState.selectedRuntime).toBe('smoke');
    expect(onboardingState.createdProfileId).toBe('profile-123');
  });

  it('resolves proxyId into a full proxy config when creating and updating profiles', async () => {
    const createProxyRes = await fetch(`${baseUrl}/api/proxies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'http',
        host: '10.0.0.1',
        port: 8080,
        username: 'alice',
        password: 'secret',
      }),
    });
    expect(createProxyRes.status).toBe(201);
    const createdProxyJson = await createProxyRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(createdProxyJson.success).toBe(true);

    const createProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Proxy bound profile',
        runtime: 'auto',
        proxyId: createdProxyJson.data.id,
      }),
    });
    expect(createProfileRes.status).toBe(201);
    const createdProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: {
        id: string;
        proxy: { id: string; host: string; port: number; type: string; username?: string };
      };
    };
    expect(createdProfileJson.success).toBe(true);
    expect(createdProfileJson.data.proxy.id).toBe(createdProxyJson.data.id);
    expect(createdProfileJson.data.proxy.host).toBe('10.0.0.1');
    expect(createdProfileJson.data.proxy.port).toBe(8080);
    expect(createdProfileJson.data.proxy.type).toBe('http');
    expect(createdProfileJson.data.proxy.username).toBe('alice');

    const clearProxyRes = await fetch(`${baseUrl}/api/profiles/${createdProfileJson.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proxyId: null,
      }),
    });
    expect(clearProxyRes.status).toBe(200);
    const clearedProfileJson = await clearProxyRes.json() as {
      success: boolean;
      data: {
        proxy: null;
      };
    };
    expect(clearedProfileJson.success).toBe(true);
    expect(clearedProfileJson.data.proxy).toBeNull();
  });

  it('bulk tests proxies and persists health snapshots', async () => {
    const { proxyManager } = await import('../managers/ProxyManager');
    const originalTestProxy = proxyManager.testProxy.bind(proxyManager);
    const originalDetectTimezone = proxyManager.detectTimezoneFromProxy.bind(proxyManager);

    proxyManager.testProxy = (async (proxy) => {
      if (proxy.host === '10.0.0.2') {
        throw new Error('Proxy timeout');
      }
      return '203.0.113.10';
    }) as typeof proxyManager.testProxy;

    proxyManager.detectTimezoneFromProxy = (async () => 'Asia/Saigon') as typeof proxyManager.detectTimezoneFromProxy;

    try {
      const createFirstProxyRes = await fetch(`${baseUrl}/api/proxies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'http',
          host: '10.0.0.1',
          port: 8080,
        }),
      });
      const firstProxyJson = await createFirstProxyRes.json() as {
        success: boolean;
        data: { id: string };
      };

      const createSecondProxyRes = await fetch(`${baseUrl}/api/proxies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'http',
          host: '10.0.0.2',
          port: 8081,
        }),
      });
      const secondProxyJson = await createSecondProxyRes.json() as {
        success: boolean;
        data: { id: string };
      };

      const bulkTestRes = await fetch(`${baseUrl}/api/proxies/test-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [firstProxyJson.data.id, secondProxyJson.data.id],
        }),
      });
      expect(bulkTestRes.status).toBe(200);
      const bulkTestJson = await bulkTestRes.json() as {
        success: boolean;
        data: {
          total: number;
          healthy: number;
          failing: number;
          results: Array<{ id: string; success: boolean; ip?: string; timezone?: string | null; error?: string }>;
        };
      };
      expect(bulkTestJson.success).toBe(true);
      expect(bulkTestJson.data.total).toBe(2);
      expect(bulkTestJson.data.healthy).toBe(1);
      expect(bulkTestJson.data.failing).toBe(1);
      expect(bulkTestJson.data.results.find((result) => result.id === firstProxyJson.data.id)).toMatchObject({
        success: true,
        ip: '203.0.113.10',
        timezone: 'Asia/Saigon',
      });
      expect(bulkTestJson.data.results.find((result) => result.id === secondProxyJson.data.id)).toMatchObject({
        success: false,
        error: 'Proxy timeout',
      });

      const listRes = await fetch(`${baseUrl}/api/proxies`);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json() as {
        success: boolean;
        data: Array<{
          id: string;
          lastCheckStatus?: 'healthy' | 'failing';
          lastCheckIp?: string;
          lastCheckTimezone?: string | null;
          lastCheckError?: string;
          lastCheckAt?: string;
        }>;
      };
      expect(listJson.success).toBe(true);
      expect(listJson.data.find((proxy) => proxy.id === firstProxyJson.data.id)).toMatchObject({
        lastCheckStatus: 'healthy',
        lastCheckIp: '203.0.113.10',
        lastCheckTimezone: 'Asia/Saigon',
      });
      expect(listJson.data.find((proxy) => proxy.id === secondProxyJson.data.id)).toMatchObject({
        lastCheckStatus: 'failing',
        lastCheckError: 'Proxy timeout',
      });
      expect(listJson.data.find((proxy) => proxy.id === firstProxyJson.data.id)?.lastCheckAt).toBeTruthy();
      expect(listJson.data.find((proxy) => proxy.id === secondProxyJson.data.id)?.lastCheckAt).toBeTruthy();
    } finally {
      proxyManager.testProxy = originalTestProxy;
      proxyManager.detectTimezoneFromProxy = originalDetectTimezone;
    }
  });
});
