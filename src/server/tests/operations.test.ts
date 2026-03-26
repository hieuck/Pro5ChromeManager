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
  let storeServer: http.Server | null = null;
  let storeBaseUrl = '';

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-ops-test-'));
    process.env['DATA_DIR'] = tmpDir;
    process.env['NODE_ENV'] = 'test';
    process.env['PRO5_SERVER_AUTOSTART'] = 'false';

    const { configManager } = await import('../features/config/ConfigManager');
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

    const { runtimeManager } = await import('../features/runtimes/RuntimeManager');
    await runtimeManager.initialize();

    const { profileManager } = await import('../features/profiles/ProfileManager');
    await profileManager.initialize();

    const { proxyManager } = await import('../managers/ProxyManager');
    await proxyManager.initialize();

    const { extensionManager } = await import('../managers/ExtensionManager');
    await extensionManager.initialize();

    const { browserCoreManager } = await import('../features/browser-cores/BrowserCoreManager');
    await browserCoreManager.initialize();

    const { app } = await import('../index');
    server = http.createServer(app);
    storeServer = http.createServer(async (req, res) => {
      if (req.url?.startsWith('/mock-store/download')) {
        const packagePath = path.join(tmpDir, 'mock-store.crx');
        const payload = await fs.readFile(packagePath);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-chrome-extension');
        res.end(payload);
        return;
      }

      if (req.url?.startsWith('/browser-core/download')) {
        const packagePath = path.join(tmpDir, 'mock-browser-core.zip');
        const payload = await fs.readFile(packagePath);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/zip');
        res.end(payload);
        return;
      }

      if (!req.url) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => {
      storeServer?.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    const storeAddress = storeServer.address();
    if (!storeAddress || typeof storeAddress === 'string') {
      throw new Error('Failed to bind mock extension store server');
    }
    storeBaseUrl = `http://127.0.0.1:${storeAddress.port}`;
    process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'] = `${storeBaseUrl}/mock-store/download?id={id}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (storeServer) {
      await new Promise<void>((resolve, reject) => {
        storeServer?.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env['DATA_DIR'];
    delete process.env['PRO5_SERVER_AUTOSTART'];
    delete process.env['PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE'];
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
        warnings: string[];
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
    expect(statusJson.data.warnings).toEqual([]);
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

  it('keeps release-only support warnings out of test runtime status', async () => {
    const previousNodeEnv = process.env['NODE_ENV'];
    const previousCodeSigning = process.env['CSC_LINK'];

    process.env['NODE_ENV'] = 'test';
    delete process.env['CSC_LINK'];

    try {
      const statusRes = await fetch(`${baseUrl}/api/support/status`);
      expect(statusRes.status).toBe(200);
      const statusJson = await statusRes.json() as {
        success: boolean;
        data: {
          warnings: string[];
        };
      };

      expect(statusJson.success).toBe(true);
      expect(statusJson.data.warnings).not.toContain('CSC_LINK is not configured; Windows builds may show SmartScreen warnings.');
      expect(statusJson.data.warnings).not.toContain('Public support/legal pages are incomplete.');
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv;
      if (previousCodeSigning === undefined) {
        delete process.env['CSC_LINK'];
      } else {
        process.env['CSC_LINK'] = previousCodeSigning;
      }
    }
  });

  it('keeps production release warnings in support status when release config is missing', async () => {
    const previousNodeEnv = process.env['NODE_ENV'];
    const previousCodeSigning = process.env['CSC_LINK'];

    process.env['NODE_ENV'] = 'production';
    delete process.env['CSC_LINK'];

    try {
      const statusRes = await fetch(`${baseUrl}/api/support/status`);
      expect(statusRes.status).toBe(200);
      const statusJson = await statusRes.json() as {
        success: boolean;
        data: {
          warnings: string[];
          releaseReady: boolean;
        };
      };

      expect(statusJson.success).toBe(true);
      expect(statusJson.data.warnings).toContain('CSC_LINK is not configured; Windows builds may show SmartScreen warnings.');
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv;
      if (previousCodeSigning === undefined) {
        delete process.env['CSC_LINK'];
      } else {
        process.env['CSC_LINK'] = previousCodeSigning;
      }
    }
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
      data: {
        count: number;
        incidents: Array<{ source: string; level: string; message: string; category: string; categoryLabel: string }>;
        summary: {
          total: number;
          topCategory: string | null;
          categories: Array<{ category: string; count: number; errorCount: number; latestAt: string | null }>;
        };
        timeline: Array<{ category: string; message: string }>;
      };
    };
    expect(incidentsJson.success).toBe(true);
    expect(incidentsJson.data.count).toBeGreaterThan(0);
    expect(incidentsJson.data.incidents.some((incident) =>
      incident.source === 'electron-main.log' &&
      incident.level === 'error' &&
      incident.message === 'Renderer failed to load URL' &&
      incident.category === 'renderer-navigation')).toBe(true);
    expect(incidentsJson.data.summary.total).toBe(incidentsJson.data.count);
    expect(incidentsJson.data.summary.topCategory).toBe('renderer-navigation');
    expect(incidentsJson.data.summary.categories.some((category) =>
      category.category === 'renderer-navigation' &&
      category.count > 0 &&
      category.errorCount > 0 &&
      category.latestAt)).toBe(true);
    expect(incidentsJson.data.timeline[0]?.category).toBe('renderer-navigation');

    const statusRes = await fetch(`${baseUrl}/api/support/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as {
      success: boolean;
      data: {
        recentIncidentCount: number;
        recentErrorCount: number;
        lastIncidentAt: string | null;
        recentIncidentTopCategory: string | null;
        recentIncidentCategories: Array<{ category: string; count: number }>;
      };
    };
    expect(statusJson.success).toBe(true);
    expect(statusJson.data.recentIncidentCount).toBeGreaterThan(0);
    expect(statusJson.data.recentErrorCount).toBeGreaterThan(0);
    expect(statusJson.data.lastIncidentAt).toBeTruthy();
    expect(statusJson.data.recentIncidentTopCategory).toBeTruthy();
    expect(statusJson.data.recentIncidentCategories.length).toBeGreaterThan(0);
  });

  it('aggregates server and electron logs into the shared ops stream', async () => {
    await fs.mkdir(path.join(tmpDir, 'logs'), { recursive: true });
    const appLogName = `app-${new Date().toISOString().slice(0, 10)}.log`;

    await fs.writeFile(
      path.join(tmpDir, 'logs', appLogName),
      `${JSON.stringify({
        timestamp: '2026-03-23T00:00:01.000Z',
        level: 'info',
        message: 'Server booted',
      })}\n`,
      'utf-8',
    );

    await fs.writeFile(
      path.join(tmpDir, 'logs', 'electron-main.log'),
      `${JSON.stringify({
        timestamp: '2026-03-23T00:00:02.000Z',
        level: 'error',
        message: 'Renderer failed to load URL',
      })}\n`,
      'utf-8',
    );

    const logsRes = await fetch(`${baseUrl}/api/logs`);
    expect(logsRes.status).toBe(200);
    const logsJson = await logsRes.json() as {
      success: boolean;
      data: Array<{
        level: string;
        message: string;
        source: string | null;
        raw: string;
        timestamp: string | null;
      }>;
    };

    expect(logsJson.success).toBe(true);
    expect(logsJson.data.length).toBeGreaterThanOrEqual(2);

    expect(logsJson.data.some((entry) =>
      entry.level === 'info' &&
      entry.message === 'Server booted' &&
      entry.source === appLogName)).toBe(true);
    expect(logsJson.data.some((entry) =>
      entry.level === 'error' &&
      entry.message === 'Renderer failed to load URL' &&
      entry.source === 'electron-main.log')).toBe(true);
    expect(logsJson.data.every((entry) => typeof entry.raw === 'string' && entry.raw.length > 0)).toBe(true);
  });

  it('includes usage metrics snapshots in support status', async () => {
    const { usageMetricsManager } = await import('../core/telemetry/UsageMetricsManager');
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

  it('imports, lists, exports, and clears profile cookies through the profile API', async () => {
    const createProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cookie Profile',
      }),
    });
    expect(createProfileRes.status).toBe(201);
    const createProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(createProfileJson.success).toBe(true);

    const profileId = createProfileJson.data.id;
    const importRes = await fetch(`${baseUrl}/api/profiles/${profileId}/cookies/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookies: [
          {
            name: 'session',
            value: 'abc',
            domain: '.example.com',
            path: '/',
            expirationDate: 1900000000,
            sameSite: 'no_restriction',
            secure: true,
          },
        ],
      }),
    });
    expect(importRes.status).toBe(201);
    const importJson = await importRes.json() as {
      success: boolean;
      data: { count: number; cookies: Array<{ sameSite: string | null }> };
    };
    expect(importJson.success).toBe(true);
    expect(importJson.data.count).toBe(1);
    expect(importJson.data.cookies[0]?.sameSite).toBe('None');

    const listRes = await fetch(`${baseUrl}/api/profiles/${profileId}/cookies`);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as {
      success: boolean;
      data: { count: number; cookies: Array<{ domain: string }> };
    };
    expect(listJson.success).toBe(true);
    expect(listJson.data.count).toBe(1);
    expect(listJson.data.cookies[0]?.domain).toBe('.example.com');

    const exportRes = await fetch(`${baseUrl}/api/profiles/${profileId}/cookies/export`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('application/json');
    const exportedCookies = JSON.parse(await exportRes.text()) as Array<{ name: string }>;
    expect(exportedCookies[0]?.name).toBe('session');

    const clearRes = await fetch(`${baseUrl}/api/profiles/${profileId}/cookies`, {
      method: 'DELETE',
    });
    expect(clearRes.status).toBe(200);

    const afterClearRes = await fetch(`${baseUrl}/api/profiles/${profileId}/cookies`);
    const afterClearJson = await afterClearRes.json() as {
      success: boolean;
      data: { count: number; cookies: unknown[] };
    };
    expect(afterClearJson.success).toBe(true);
    expect(afterClearJson.data.count).toBe(0);
    expect(afterClearJson.data.cookies).toEqual([]);
  });

  it('persists profile bookmarks and syncs them into the Chromium bookmarks file', async () => {
    const bookmarks = [
      {
        name: 'Google',
        url: 'https://www.google.com/',
        folder: 'Daily',
      },
      {
        name: 'Docs',
        url: 'https://docs.example.com/',
        folder: null,
      },
    ];

    const createProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bookmark Profile',
        bookmarks,
      }),
    });
    expect(createProfileRes.status).toBe(201);
    const createProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: {
        id: string;
        bookmarks: Array<{ name: string; url: string; folder: string | null }>;
      };
    };
    expect(createProfileJson.success).toBe(true);
    expect(createProfileJson.data.bookmarks).toEqual(bookmarks);

    const profileId = createProfileJson.data.id;
    const getProfileRes = await fetch(`${baseUrl}/api/profiles/${profileId}`);
    expect(getProfileRes.status).toBe(200);
    const getProfileJson = await getProfileRes.json() as {
      success: boolean;
      data: {
        bookmarks: Array<{ name: string; url: string; folder: string | null }>;
      };
    };
    expect(getProfileJson.success).toBe(true);
    expect(getProfileJson.data.bookmarks).toEqual(bookmarks);

    const chromiumBookmarksPath = path.join(tmpDir, 'profiles', profileId, 'Default', 'Bookmarks');
    const chromiumBookmarks = JSON.parse(await fs.readFile(chromiumBookmarksPath, 'utf-8')) as {
      roots?: {
        bookmark_bar?: {
          children?: Array<{
            type?: string;
            name?: string;
            url?: string;
            children?: Array<{ name?: string; url?: string }>;
          }>;
        };
      };
    };

    const bookmarkBarChildren = chromiumBookmarks.roots?.bookmark_bar?.children ?? [];
    expect(bookmarkBarChildren.some((child) => child.type === 'url' && child.name === 'Docs' && child.url === 'https://docs.example.com/')).toBe(true);
    const dailyFolder = bookmarkBarChildren.find((child) => child.type === 'folder' && child.name === 'Daily');
    expect(dailyFolder?.children?.some((child) => child.name === 'Google' && child.url === 'https://www.google.com/')).toBe(true);
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
      incidents: Array<{ message: string; category: string }>;
      summary: {
        topCategory: string | null;
        categories: Array<{ category: string; count: number }>;
      };
      timeline: Array<{ message: string; category: string }>;
    };
    const incidentSummary = JSON.parse(await fs.readFile(path.join(extractDir, 'incident-summary.json'), 'utf-8')) as {
      topCategory: string | null;
      categories: Array<{ category: string; count: number }>;
    };
    const incidentTimeline = JSON.parse(await fs.readFile(path.join(extractDir, 'incident-timeline.json'), 'utf-8')) as Array<{
      message: string;
      category: string;
    }>;
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
    expect(supportStatus.profileCount).toBeGreaterThanOrEqual(0);
    expect(supportStatus.proxyCount).toBe(0);
    expect(supportStatus.backupCount).toBe(0);
    expect(supportStatus.usageMetrics.profileCreates).toBeGreaterThanOrEqual(1);
    expect(supportStatus.usageMetrics.profileImports).toBe(1);
    expect(supportStatus.usageMetrics.profileLaunches).toBe(1);
    expect(supportStatus.usageMetrics.sessionChecks).toBe(3);
    expect(supportStatus.recentIncidentCount).toBeGreaterThan(0);
    expect(selfTest.status).toBe('pass');
    expect(selfTest.checks.some((check) => check.key === 'diagnostics')).toBe(true);
    expect(incidents.count).toBeGreaterThan(0);
    expect(incidents.incidents.some((incident) => incident.message === 'Test warning for diagnostics export')).toBe(true);
    expect(incidents.summary.categories.length).toBeGreaterThan(0);
    expect(incidentSummary.categories.length).toBeGreaterThan(0);
    expect(incidentTimeline.some((incident) => incident.message === 'Test warning for diagnostics export')).toBe(true);
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
          name: string;
          runtime: string;
          proxy: { id: string; host: string; port: number; type: string; username?: string };
        };
      };
      expect(createdProfileJson.success).toBe(true);
      expect(createdProfileJson.data.name).toBe('Proxy bound profile');
      expect(createdProfileJson.data.runtime).toBe('auto');
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
          name: string;
          runtime: string;
          proxy: null;
        };
      };
      expect(clearedProfileJson.success).toBe(true);
      expect(clearedProfileJson.data.name).toBe('Proxy bound profile');
      expect(clearedProfileJson.data.runtime).toBe('auto');
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

  it('restarts profiles through the restart endpoint', async () => {
    const { instanceManager } = await import('../features/instances/InstanceManager');
    const originalGetStatus = instanceManager.getStatus.bind(instanceManager);
    const originalStopInstance = instanceManager.stopInstance.bind(instanceManager);
    const originalLaunchInstance = instanceManager.launchInstance.bind(instanceManager);

    const calls: string[] = [];

    instanceManager.getStatus = ((profileId: string) => (
      profileId === 'running-profile' ? 'running' : 'not_running'
    )) as typeof instanceManager.getStatus;

    instanceManager.stopInstance = (async (profileId: string) => {
      calls.push(`stop:${profileId}`);
    }) as typeof instanceManager.stopInstance;

    instanceManager.launchInstance = (async (profileId: string) => {
      calls.push(`launch:${profileId}`);
      return {
        profileId,
        profileName: `Profile ${profileId}`,
        runtime: 'test-runtime',
        pid: 1234,
        remoteDebuggingPort: 9222,
        userDataDir: '/tmp/profile',
        launchMode: 'native',
        status: 'running',
        startedAt: new Date().toISOString(),
        lastHealthCheckAt: null,
      };
    }) as typeof instanceManager.launchInstance;

    try {
      const runningRes = await fetch(`${baseUrl}/api/profiles/running-profile/restart`, {
        method: 'POST',
      });
      expect(runningRes.status).toBe(201);

      const stoppedRes = await fetch(`${baseUrl}/api/profiles/stopped-profile/restart`, {
        method: 'POST',
      });
      expect(stoppedRes.status).toBe(201);

      expect(calls).toEqual([
        'stop:running-profile',
        'launch:running-profile',
        'launch:stopped-profile',
      ]);
    } finally {
      instanceManager.getStatus = originalGetStatus;
      instanceManager.stopInstance = originalStopInstance;
      instanceManager.launchInstance = originalLaunchInstance;
    }
  });

  it('adds extensions and binds them to profiles', async () => {
    const extensionDir = path.join(tmpDir, 'sample-extension');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Sample Operations Extension',
      version: '0.1.0',
      description: 'Operations fixture extension',
    }, null, 2), 'utf-8');

    const createExtensionRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: extensionDir,
      }),
    });
    expect(createExtensionRes.status).toBe(201);
    const createdExtensionJson = await createExtensionRes.json() as {
      success: boolean;
      data: { id: string; name: string; entryPath: string; enabled: boolean; category: string | null; defaultForNewProfiles: boolean };
    };
    expect(createdExtensionJson.success).toBe(true);
    expect(createdExtensionJson.data.name).toBe('Sample Operations Extension');
    expect(createdExtensionJson.data.entryPath).toBe(extensionDir);
    expect(createdExtensionJson.data.enabled).toBe(true);
    expect(createdExtensionJson.data.category).toBeNull();
    expect(createdExtensionJson.data.defaultForNewProfiles).toBe(false);

    const createProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Extension bound profile',
        extensionIds: [createdExtensionJson.data.id],
      }),
    });
    expect(createProfileRes.status).toBe(201);
    const createdProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: { extensionIds: string[] };
    };
    expect(createdProfileJson.success).toBe(true);
    expect(createdProfileJson.data.extensionIds).toEqual([createdExtensionJson.data.id]);

    const listExtensionsRes = await fetch(`${baseUrl}/api/extensions`);
    expect(listExtensionsRes.status).toBe(200);
    const listExtensionsJson = await listExtensionsRes.json() as {
      success: boolean;
      data: Array<{ id: string; name: string }>;
    };
    expect(listExtensionsJson.success).toBe(true);
    expect(listExtensionsJson.data.some((extension) => extension.id === createdExtensionJson.data.id)).toBe(true);

    const disableExtensionRes = await fetch(`${baseUrl}/api/extensions/${createdExtensionJson.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        name: 'Disabled Sample Extension',
        category: 'wallet',
        defaultForNewProfiles: true,
      }),
    });
    expect(disableExtensionRes.status).toBe(200);
    const disableExtensionJson = await disableExtensionRes.json() as {
      success: boolean;
      data: { enabled: boolean; name: string; category: string | null; defaultForNewProfiles: boolean };
    };
    expect(disableExtensionJson.success).toBe(true);
    expect(disableExtensionJson.data.enabled).toBe(false);
    expect(disableExtensionJson.data.name).toBe('Disabled Sample Extension');
    expect(disableExtensionJson.data.category).toBe('wallet');
    expect(disableExtensionJson.data.defaultForNewProfiles).toBe(true);
  });

  it('auto-applies default extensions to newly created profiles', async () => {
    const extensionDir = path.join(tmpDir, 'default-extension');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Default Stack Extension',
      version: '0.2.0',
    }, null, 2), 'utf-8');

    const createExtensionRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: extensionDir,
        category: 'wallet',
        defaultForNewProfiles: true,
      }),
    });
    expect(createExtensionRes.status).toBe(201);
    const createExtensionJson = await createExtensionRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(createExtensionJson.success).toBe(true);

    const createProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Default Extension Profile',
      }),
    });
    expect(createProfileRes.status).toBe(201);
    const createProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: { extensionIds: string[] };
    };
    expect(createProfileJson.success).toBe(true);
    expect(createProfileJson.data.extensionIds).toContain(createExtensionJson.data.id);
  });

  it('imports packaged zip extensions through the extensions API', async () => {
    const extensionDir = path.join(tmpDir, 'zip-extension');
    const zipPath = path.join(tmpDir, 'zip-extension.zip');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Zip Stack Extension',
      version: '0.3.0',
    }, null, 2), 'utf-8');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(extensionDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    const createExtensionRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: zipPath,
        category: 'automation',
      }),
    });
    expect(createExtensionRes.status).toBe(201);
    const createExtensionJson = await createExtensionRes.json() as {
      success: boolean;
      data: { id: string; sourcePath: string; entryPath: string; category: string | null };
    };

    expect(createExtensionJson.success).toBe(true);
    expect(createExtensionJson.data.sourcePath).toBe(zipPath);
    expect(createExtensionJson.data.entryPath).not.toBe(zipPath);
    expect(createExtensionJson.data.entryPath).toContain(path.join('extensions', 'packages'));
    expect(createExtensionJson.data.category).toBe('automation');
  });

  it('imports packaged crx extensions through the extensions API', async () => {
    const extensionDir = path.join(tmpDir, 'crx-extension');
    const zipPath = path.join(tmpDir, 'crx-extension.zip');
    const crxPath = path.join(tmpDir, 'crx-extension.crx');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'CRX Stack Extension',
      version: '0.4.0',
    }, null, 2), 'utf-8');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(extensionDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );
    const zipBytes = await fs.readFile(zipPath);
    const header = Buffer.alloc(16);
    header.write('Cr24', 0, 'ascii');
    header.writeUInt32LE(3, 4);
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(0, 12);
    await fs.writeFile(crxPath, Buffer.concat([header, zipBytes]));

    const createExtensionRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: crxPath,
        category: 'wallet',
      }),
    });
    expect(createExtensionRes.status).toBe(201);
    const createExtensionJson = await createExtensionRes.json() as {
      success: boolean;
      data: { sourcePath: string; entryPath: string; category: string | null };
    };

    expect(createExtensionJson.success).toBe(true);
    expect(createExtensionJson.data.sourcePath).toBe(crxPath);
    expect(createExtensionJson.data.entryPath).not.toBe(crxPath);
    expect(createExtensionJson.data.entryPath).toContain(path.join('extensions', 'packages'));
    expect(createExtensionJson.data.category).toBe('wallet');
  });

  it('imports Chrome Web Store extensions through the extensions API by id and by URL', async () => {
    const extensionDir = path.join(tmpDir, 'store-extension');
    const zipPath = path.join(tmpDir, 'store-extension.zip');
    const crxPath = path.join(tmpDir, 'mock-store.crx');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Store Download Extension',
      version: '0.5.0',
    }, null, 2), 'utf-8');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(extensionDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );
    const zipBytes = await fs.readFile(zipPath);
    const header = Buffer.alloc(16);
    header.write('Cr24', 0, 'ascii');
    header.writeUInt32LE(3, 4);
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(0, 12);
    await fs.writeFile(crxPath, Buffer.concat([header, zipBytes]));

    const createByIdRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        category: 'wallet',
      }),
    });
    expect(createByIdRes.status).toBe(201);
    const createByIdJson = await createByIdRes.json() as {
      success: boolean;
      data: { sourcePath: string; entryPath: string; category: string | null };
    };
    expect(createByIdJson.success).toBe(true);
    expect(createByIdJson.data.sourcePath).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(createByIdJson.data.entryPath).toContain(path.join('extensions', 'packages'));
    expect(createByIdJson.data.category).toBe('wallet');

    const createByUrlRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: 'https://chromewebstore.google.com/detail/store-download-extension/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        category: 'automation',
      }),
    });
    expect(createByUrlRes.status).toBe(201);
    const createByUrlJson = await createByUrlRes.json() as {
      success: boolean;
      data: { sourcePath: string; entryPath: string; category: string | null };
    };
    expect(createByUrlJson.success).toBe(true);
    expect(createByUrlJson.data.sourcePath).toBe('https://chromewebstore.google.com/detail/store-download-extension/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(createByUrlJson.data.entryPath).toContain(path.join('extensions', 'packages'));
    expect(createByUrlJson.data.category).toBe('automation');
  });

  it('creates many profiles in one request through the bulk create API', async () => {
    const proxyRes = await fetch(`${baseUrl}/api/proxies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: '198.51.100.44',
        port: 8600,
        type: 'http',
        label: 'Bulk API Proxy',
      }),
    });
    const proxyJson = await proxyRes.json() as { success: boolean; data: { id: string } };
    expect(proxyJson.success).toBe(true);

    const createProfilesRes = await fetch(`${baseUrl}/api/profiles/bulk-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runtime: 'smoke',
        proxyId: proxyJson.data.id,
        entries: [
          { name: 'Bulk API Alpha', group: 'Growth', owner: 'alice', tags: ['warm'] },
          { name: 'Bulk API Beta', notes: 'Second row', tags: ['scale', 'team-b'] },
        ],
      }),
    });
    expect(createProfilesRes.status).toBe(201);
    const createProfilesJson = await createProfilesRes.json() as {
      success: boolean;
      data: {
        total: number;
        profiles: Array<{ name: string; runtime: string; proxy: { id: string } | null; group: string | null; owner: string | null; tags: string[]; notes: string }>;
      };
    };
    expect(createProfilesJson.success).toBe(true);
    expect(createProfilesJson.data.total).toBe(2);
    expect(createProfilesJson.data.profiles.map((profile) => profile.name)).toEqual(['Bulk API Alpha', 'Bulk API Beta']);
    expect(createProfilesJson.data.profiles.every((profile) => profile.runtime === 'smoke')).toBe(true);
    expect(createProfilesJson.data.profiles.every((profile) => profile.proxy?.id === proxyJson.data.id)).toBe(true);
    expect(createProfilesJson.data.profiles[0]?.group).toBe('Growth');
    expect(createProfilesJson.data.profiles[0]?.owner).toBe('alice');
    expect(createProfilesJson.data.profiles[1]?.notes).toBe('Second row');
  });

  it('bulk updates profiles with clearable fields and tag operations in one request', async () => {
    const firstProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bulk Update Alpha',
        group: 'Warm',
        owner: 'alice',
        tags: ['warm', 'alpha'],
      }),
    });
    expect(firstProfileRes.status).toBe(201);
    const firstProfileJson = await firstProfileRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(firstProfileJson.success).toBe(true);

    const secondProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bulk Update Beta',
        group: 'Warm',
        owner: 'bob',
        tags: ['warm', 'beta'],
      }),
    });
    expect(secondProfileRes.status).toBe(201);
    const secondProfileJson = await secondProfileRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(secondProfileJson.success).toBe(true);

    const bulkUpdateRes = await fetch(`${baseUrl}/api/profiles/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [firstProfileJson.data.id, secondProfileJson.data.id],
        updates: {
          group: null,
          owner: null,
          runtime: 'smoke',
          addTags: ['shared', 'priority'],
          removeTags: ['warm'],
        },
      }),
    });
    expect(bulkUpdateRes.status).toBe(200);
    const bulkUpdateJson = await bulkUpdateRes.json() as {
      success: boolean;
      data: {
        total: number;
        profiles: Array<{
          group: string | null;
          owner: string | null;
          runtime: string;
          tags: string[];
        }>;
      };
    };
    expect(bulkUpdateJson.success).toBe(true);
    expect(bulkUpdateJson.data.total).toBe(2);
    expect(bulkUpdateJson.data.profiles.every((profile) => profile.group === null)).toBe(true);
    expect(bulkUpdateJson.data.profiles.every((profile) => profile.owner === null)).toBe(true);
    expect(bulkUpdateJson.data.profiles.every((profile) => profile.runtime === 'smoke')).toBe(true);
    expect(bulkUpdateJson.data.profiles[0]?.tags).toEqual(expect.arrayContaining(['alpha', 'shared', 'priority']));
    expect(bulkUpdateJson.data.profiles[0]?.tags).not.toContain('warm');
    expect(bulkUpdateJson.data.profiles[1]?.tags).toEqual(expect.arrayContaining(['beta', 'shared', 'priority']));
    expect(bulkUpdateJson.data.profiles[1]?.tags).not.toContain('warm');
  });

  it('rejects bulk updates when any profile id is missing without mutating valid profiles', async () => {
    const profileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bulk Update Guard',
        group: 'Original Group',
        owner: 'keeper',
        tags: ['keep-me'],
      }),
    });
    expect(profileRes.status).toBe(201);
    const profileJson = await profileRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(profileJson.success).toBe(true);

    const bulkUpdateRes = await fetch(`${baseUrl}/api/profiles/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [profileJson.data.id, 'missing-profile-id'],
        updates: {
          group: null,
          addTags: ['mutated'],
        },
      }),
    });
    expect(bulkUpdateRes.status).toBe(404);

    const unchangedProfileRes = await fetch(`${baseUrl}/api/profiles/${profileJson.data.id}`);
    expect(unchangedProfileRes.status).toBe(200);
    const unchangedProfileJson = await unchangedProfileRes.json() as {
      success: boolean;
      data: {
        group: string | null;
        owner: string | null;
        tags: string[];
      };
    };
    expect(unchangedProfileJson.success).toBe(true);
    expect(unchangedProfileJson.data.group).toBe('Original Group');
    expect(unchangedProfileJson.data.owner).toBe('keeper');
    expect(unchangedProfileJson.data.tags).toEqual(['keep-me']);
  });

  it('lists extension bundles by category and applies them during profile creation', async () => {
    const existingExtensionsRes = await fetch(`${baseUrl}/api/extensions`);
    const existingExtensionsJson = await existingExtensionsRes.json() as {
      success: boolean;
      data: Array<{ id: string }>;
    };
    expect(existingExtensionsJson.success).toBe(true);
    for (const extension of existingExtensionsJson.data) {
      await fetch(`${baseUrl}/api/extensions/${extension.id}`, { method: 'DELETE' });
    }

    const walletDir = path.join(tmpDir, 'bundle-wallet-extension');
    const automationDir = path.join(tmpDir, 'bundle-automation-extension');
    await fs.mkdir(walletDir, { recursive: true });
    await fs.mkdir(automationDir, { recursive: true });
    await fs.writeFile(path.join(walletDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Bundle Wallet',
      version: '1.0.0',
    }, null, 2), 'utf-8');
    await fs.writeFile(path.join(automationDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Bundle Automation',
      version: '1.0.0',
    }, null, 2), 'utf-8');

    const walletRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: walletDir,
        category: 'wallet',
      }),
    });
    const walletJson = await walletRes.json() as { success: boolean; data: { id: string } };
    expect(walletJson.success).toBe(true);

    const automationRes = await fetch(`${baseUrl}/api/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: automationDir,
        category: 'automation',
      }),
    });
    const automationJson = await automationRes.json() as { success: boolean; data: { id: string } };
    expect(automationJson.success).toBe(true);

    const bundlesRes = await fetch(`${baseUrl}/api/extensions/bundles`);
    expect(bundlesRes.status).toBe(200);
    const bundlesJson = await bundlesRes.json() as {
      success: boolean;
      data: Array<{ key: string; label: string; extensionIds: string[]; extensionCount: number }>;
    };
    expect(bundlesJson.success).toBe(true);
    expect(bundlesJson.data).toEqual([
      { key: 'automation', label: 'automation', extensionIds: [automationJson.data.id], extensionCount: 1 },
      { key: 'wallet', label: 'wallet', extensionIds: [walletJson.data.id], extensionCount: 1 },
    ]);

    const createProfileRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bundled Profile',
        extensionCategories: ['wallet', 'automation'],
      }),
    });
    expect(createProfileRes.status).toBe(201);
    const createProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: { extensionIds: string[] };
    };
    expect(createProfileJson.success).toBe(true);
    expect(createProfileJson.data.extensionIds).toEqual([
      automationJson.data.id,
      walletJson.data.id,
    ]);
  });

  it('imports an exported profile package through the raw package endpoint', async () => {
    const createRes = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Portable API Profile',
        notes: 'package import',
        group: 'ops',
        tags: ['portable'],
        runtime: 'smoke',
        bookmarks: [
          { name: 'Example', url: 'https://example.com', folder: 'Warmup' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json() as {
      success: boolean;
      data: { id: string };
    };
    expect(createdJson.success).toBe(true);

    const cookiesRes = await fetch(`${baseUrl}/api/profiles/${createdJson.data.id}/cookies/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookies: [
          {
            name: 'session',
            value: 'ops-123',
            domain: '.example.com',
            path: '/',
            expires: null,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
        ],
      }),
    });
    expect(cookiesRes.status).toBe(201);

    const exportRes = await fetch(`${baseUrl}/api/profiles/${createdJson.data.id}/export`);
    expect(exportRes.status).toBe(200);
    const archiveBuffer = Buffer.from(await exportRes.arrayBuffer());
    expect(archiveBuffer.byteLength).toBeGreaterThan(100);

    const importRes = await fetch(`${baseUrl}/api/profiles/import-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: archiveBuffer,
    });
    expect(importRes.status).toBe(201);
    const importJson = await importRes.json() as {
      success: boolean;
      data: {
        id: string;
        name: string;
        notes: string;
        group: string | null;
        tags: string[];
        bookmarks: Array<{ name: string; url: string; folder: string | null }>;
      };
    };
    expect(importJson.success).toBe(true);
    expect(importJson.data.id).not.toBe(createdJson.data.id);
    expect(importJson.data.name).toBe('Portable API Profile');
    expect(importJson.data.notes).toBe('package import');
    expect(importJson.data.group).toBe('ops');
    expect(importJson.data.tags).toEqual(['portable']);
    expect(importJson.data.bookmarks).toEqual([
      { name: 'Example', url: 'https://example.com', folder: 'Warmup' },
    ]);

    const importedCookiesRes = await fetch(`${baseUrl}/api/profiles/${importJson.data.id}/cookies`);
    expect(importedCookiesRes.status).toBe(200);
    const importedCookiesJson = await importedCookiesRes.json() as {
      success: boolean;
      data: {
        count: number;
        cookies: Array<{ name: string; value: string }>;
      };
    };
    expect(importedCookiesJson.success).toBe(true);
    expect(importedCookiesJson.data.count).toBe(1);
    expect(importedCookiesJson.data.cookies[0]).toMatchObject({ name: 'session', value: 'ops-123' });
  });

  it('imports packaged browser cores and exposes catalog install state through the API', async () => {
    const sourceDir = path.join(tmpDir, 'browser-core-package');
    const runtimeDir = path.join(sourceDir, 'runtime');
    const packagePath = path.join(tmpDir, 'browser-core-package.zip');
    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'browser-core.json'),
      JSON.stringify({
        key: 'pro5-chromium',
        label: 'Pro5 Chromium',
        version: '127.0.0-preview',
        executableRelativePath: 'runtime/pro5-chromium.exe',
        channel: 'preview',
        platform: 'win32',
      }, null, 2),
      'utf-8',
    );
    await fs.writeFile(path.join(runtimeDir, 'pro5-chromium.exe'), 'stub-binary', 'utf-8');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(sourceDir, '*').replace(/'/g, "''")}' -DestinationPath '${packagePath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    const importRes = await fetch(`${baseUrl}/api/browser-cores/import-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: await fs.readFile(packagePath),
    });
    expect(importRes.status).toBe(201);
    const importJson = await importRes.json() as {
      success: boolean;
      data: {
        id: string;
        key: string;
        managedRuntimeKey: string;
        executablePath: string;
      };
    };
    expect(importJson.success).toBe(true);
    expect(importJson.data.key).toBe('pro5-chromium');
    expect(importJson.data.managedRuntimeKey).toBe('core-pro5-chromium');
    expect(await fs.access(importJson.data.executablePath).then(() => true).catch(() => false)).toBe(true);

    const listRes = await fetch(`${baseUrl}/api/browser-cores`);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as {
      success: boolean;
      data: Array<{ id: string; key: string; managedRuntimeKey: string }>;
    };
    expect(listJson.success).toBe(true);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0]?.managedRuntimeKey).toBe('core-pro5-chromium');

    const catalogRes = await fetch(`${baseUrl}/api/browser-cores/catalog`);
    expect(catalogRes.status).toBe(200);
    const catalogJson = await catalogRes.json() as {
      success: boolean;
      data: Array<{ key: string; installed: boolean; installedCoreId: string | null }>;
    };
    expect(catalogJson.success).toBe(true);
    expect(catalogJson.data.some((entry) =>
      entry.key === 'pro5-chromium' &&
      entry.installed &&
      entry.installedCoreId === importJson.data.id)).toBe(true);

    const runtimesRes = await fetch(`${baseUrl}/api/runtimes`);
    expect(runtimesRes.status).toBe(200);
    const runtimesJson = await runtimesRes.json() as {
      success: boolean;
      data: Array<{ key: string; executablePath: string }>;
    };
    expect(runtimesJson.success).toBe(true);
    expect(runtimesJson.data.some((runtime) =>
      runtime.key === 'core-pro5-chromium' &&
      runtime.executablePath === importJson.data.executablePath)).toBe(true);
  });

  it('installs a browser core directly from the catalog artifact URL', async () => {
    const sourceDir = path.join(tmpDir, 'browser-core-catalog-package');
    const runtimeDir = path.join(sourceDir, 'runtime');
    const packagePath = path.join(tmpDir, 'browser-core-catalog-package.zip');
    const previousUrl = process.env['PRO5_BROWSER_CORE_URL'];
    const previousVersion = process.env['PRO5_BROWSER_CORE_VERSION'];

    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'browser-core.json'),
      JSON.stringify({
        key: 'pro5-chromium',
        label: 'Pro5 Chromium',
        version: '128.0.0-preview',
        executableRelativePath: 'runtime/pro5-chromium.exe',
        channel: 'preview',
        platform: 'win32',
      }, null, 2),
      'utf-8',
    );
    await fs.writeFile(path.join(runtimeDir, 'pro5-chromium.exe'), 'stub-binary-v2', 'utf-8');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(sourceDir, '*').replace(/'/g, "''")}' -DestinationPath '${packagePath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    try {
      process.env['PRO5_BROWSER_CORE_URL'] = `${storeBaseUrl}/browser-core/download`;
      process.env['PRO5_BROWSER_CORE_VERSION'] = '128.0.0-preview';
      await fs.copyFile(packagePath, path.join(tmpDir, 'mock-browser-core.zip'));

      const installRes = await fetch(`${baseUrl}/api/browser-cores/catalog/pro5-chromium/install`, {
        method: 'POST',
      });
      expect(installRes.status).toBe(201);
      const installJson = await installRes.json() as {
        success: boolean;
        data: {
          id: string;
          key: string;
          version: string;
          managedRuntimeKey: string;
        };
      };
      expect(installJson.success).toBe(true);
      expect(installJson.data.key).toBe('pro5-chromium');
      expect(installJson.data.version).toBe('128.0.0-preview');
      expect(installJson.data.managedRuntimeKey).toBe('core-pro5-chromium');

      const listRes = await fetch(`${baseUrl}/api/browser-cores`);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json() as {
        success: boolean;
        data: Array<{ key: string; version: string }>;
      };
      expect(listJson.success).toBe(true);
      expect(listJson.data.some((core) => core.key === 'pro5-chromium' && core.version === '128.0.0-preview')).toBe(true);
    } finally {
      if (previousUrl === undefined) {
        delete process.env['PRO5_BROWSER_CORE_URL'];
      } else {
        process.env['PRO5_BROWSER_CORE_URL'] = previousUrl;
      }
      if (previousVersion === undefined) {
        delete process.env['PRO5_BROWSER_CORE_VERSION'];
      } else {
        process.env['PRO5_BROWSER_CORE_VERSION'] = previousVersion;
      }
    }
  });
});
