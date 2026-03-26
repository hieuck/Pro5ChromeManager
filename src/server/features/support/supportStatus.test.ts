import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as diagnostics from './supportDiagnostics';
import { createSupportSelfTest, createSupportStatus } from './supportStatus';

describe('supportStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env['CSC_LINK'];
    delete process.env['PRO5_OFFLINE_SECRET'];
    delete process.env['OFFLINE_SECRET'];
    process.env['NODE_ENV'] = 'test';
  });

  it('builds support status with aggregated counts and no release-only warnings in test mode', async () => {
    vi.spyOn(diagnostics, 'listLogFiles').mockResolvedValue(['app.log', 'electron-main.log']);
    vi.spyOn(diagnostics, 'loadIncidentEntries').mockResolvedValue([
      {
        timestamp: '2026-03-26T00:00:02.000Z',
        level: 'error',
        source: 'app.log',
        message: 'Proxy failed',
        category: 'proxy',
        categoryLabel: 'Proxy',
        fingerprint: 'proxy-issue',
      },
    ]);
    vi.spyOn(diagnostics, 'fileExists').mockImplementation(async (filePath) => filePath.endsWith('config.json'));
    vi.spyOn(diagnostics, 'getSupportPagesReady').mockResolvedValue(false);

    const payload = await createSupportStatus({
      getConfig: () => ({ onboardingCompleted: true, profilesDir: 'profiles' }),
      listProfiles: () => [{ id: 'a' }, { id: 'b' }],
      listProxies: () => [{ id: 'p' }],
      listBackups: async () => [{ id: 'b1' }],
      initializeUsageMetrics: async () => undefined,
      getUsageMetricsSnapshot: () => ({
        profileCreates: 1,
        profileImports: 2,
        profileLaunches: 3,
        sessionChecks: 4,
        sessionCheckLoggedIn: 1,
        sessionCheckLoggedOut: 2,
        sessionCheckErrors: 1,
        lastProfileCreatedAt: null,
        lastProfileImportedAt: null,
        lastProfileLaunchAt: null,
        lastSessionCheckAt: null,
      }),
      initializeOnboardingState: async () => undefined,
      getOnboardingSnapshot: () => ({
        status: 'completed',
        currentStep: 4,
        selectedRuntime: 'chrome',
        draftProfileName: 'Demo',
        createdProfileId: 'profile-1',
        lastOpenedAt: null,
        lastUpdatedAt: null,
        profileCreatedAt: null,
        completedAt: null,
        skippedAt: null,
      }),
      listFeedback: async () => [{ createdAt: '2026-03-26T00:00:01.000Z' }],
    });

    expect(payload.profileCount).toBe(2);
    expect(payload.proxyCount).toBe(1);
    expect(payload.backupCount).toBe(1);
    expect(payload.feedbackCount).toBe(1);
    expect(payload.logFileCount).toBe(2);
    expect(payload.recentIncidentCount).toBe(1);
    expect(payload.recentErrorCount).toBe(1);
    expect(payload.recentIncidentTopCategory).toBe('proxy');
    expect(payload.supportPagesReady).toBe(false);
    expect(payload.warnings).toEqual([]);
  });

  it('adds release warnings when production prerequisites are missing', async () => {
    process.env['NODE_ENV'] = 'production';
    vi.spyOn(diagnostics, 'listLogFiles').mockResolvedValue([]);
    vi.spyOn(diagnostics, 'loadIncidentEntries').mockResolvedValue([]);
    vi.spyOn(diagnostics, 'fileExists').mockResolvedValue(false);
    vi.spyOn(diagnostics, 'getSupportPagesReady').mockResolvedValue(false);

    const payload = await createSupportStatus({
      getConfig: () => ({ onboardingCompleted: false, profilesDir: 'profiles' }),
      listProfiles: () => [],
      listProxies: () => [],
      listBackups: async () => [],
      initializeUsageMetrics: async () => undefined,
      getUsageMetricsSnapshot: () => ({
        profileCreates: 0,
        profileImports: 0,
        profileLaunches: 0,
        sessionChecks: 0,
        sessionCheckLoggedIn: 0,
        sessionCheckLoggedOut: 0,
        sessionCheckErrors: 0,
        lastProfileCreatedAt: null,
        lastProfileImportedAt: null,
        lastProfileLaunchAt: null,
        lastSessionCheckAt: null,
      }),
      initializeOnboardingState: async () => undefined,
      getOnboardingSnapshot: () => ({
        status: 'not_started',
        currentStep: 0,
        selectedRuntime: null,
        draftProfileName: null,
        createdProfileId: null,
        lastOpenedAt: null,
        lastUpdatedAt: null,
        profileCreatedAt: null,
        completedAt: null,
        skippedAt: null,
      }),
      listFeedback: async () => [],
    });

    expect(payload.releaseReady).toBe(false);
    expect(payload.warnings).toEqual([
      'Base configuration file is missing.',
      'CSC_LINK is not configured; Windows builds may show SmartScreen warnings.',
      'Public support/legal pages are incomplete.',
    ]);
  });

  it('builds self-test status from checks and escalates fail over warn', async () => {
    vi.spyOn(diagnostics, 'fileExists').mockResolvedValue(false);
    vi.spyOn(diagnostics, 'getSupportPagesReady').mockResolvedValue(false);

    const payload = await createSupportSelfTest({
      getConfig: () => ({ profilesDir: 'profiles' }),
      refreshRuntimeAvailability: async () => undefined,
      listRuntimes: () => [{ available: false }, { available: false }],
      listProxies: () => [{ id: 'proxy-1' }, { id: 'proxy-2' }],
    });

    expect(payload.status).toBe('fail');
    expect(payload.checks.map((check) => check.key)).toEqual([
      'profiles-dir',
      'runtime',
      'diagnostics',
      'support-pages',
      'proxy-store',
    ]);
    expect(payload.checks.find((check) => check.key === 'proxy-store')?.detail).toBe('2 proxy configuration(s) loaded.');
    expect(payload.checks.find((check) => check.key === 'support-pages')?.status).toBe('warn');
  });
});
