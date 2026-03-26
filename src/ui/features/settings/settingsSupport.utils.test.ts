import { describe, expect, it } from 'vitest';
import type { SelfTestResult, SupportIncidentsResult, SupportStatus } from '../../../shared/contracts';
import {
  buildSupportSummaryLines,
  formatUptime,
  getIncidentCategoryColor,
  getOnboardingStateLabel,
  getSelfTestStatusLabel,
} from './settingsSupport.utils';

const t = {
  settings: {
    statusPass: 'Pass',
    statusWarn: 'Warn',
    statusFail: 'Fail',
    onboardingStateInProgress: 'In progress',
    onboardingStateProfileCreated: 'Profile created',
    onboardingStateCompleted: 'Completed',
    onboardingStateSkipped: 'Skipped',
    onboardingStateNotStarted: 'Not started',
    supportSummaryTitle: 'Support summary',
    appVersionLabel: 'App version',
    nodeVersionLabel: 'Node version',
    platformLabel: 'Platform',
    uptimeLabel: 'Uptime',
    dataDirLabel: 'Data dir',
    diagnosticsLabel: 'Diagnostics',
    diagnosticsReadyState: 'Ready',
    diagnosticsMissingState: 'Missing',
    onboardingLabel: 'Onboarding',
    statusCompleted: 'Completed',
    statusPending: 'Pending',
    onboardingStateLabel: 'Onboarding state',
    stepLabel: 'Step',
    profilesLabel: 'Profiles',
    proxiesLabel: 'Proxies',
    backupsLabel: 'Backups',
    feedbackInboxLabel: 'Feedback',
    entriesLabel: 'entries',
    usageLabel: 'Usage',
    createdLabel: 'created',
    importedLabel: 'imported',
    launchesLabel: 'launches',
    sessionChecksLabel: 'Session checks',
    totalLabel: 'total',
    loggedInLabel: 'logged in',
    loggedOutLabel: 'logged out',
    errorsLabel: 'errors',
    offlineSecretLabel: 'Offline secret',
    configuredState: 'Configured',
    missingState: 'Missing',
    codeSigningLabel: 'Code signing',
    supportPagesLabel: 'Support pages',
    readyState: 'Ready',
    releaseReadinessLabel: 'Release readiness',
    needsAttentionState: 'Needs attention',
    recentIncidentsLabel: 'Recent incidents',
    lastIncidentLabel: 'Last incident',
    topIncidentCategoryLabel: 'Top incident category',
    noneValue: 'None',
    lastProfileCreatedLabel: 'Last profile created',
    lastProfileImportedLabel: 'Last profile imported',
    lastLaunchLabel: 'Last launch',
    lastSessionCheckLabel: 'Last session check',
    lastOnboardingOpenLabel: 'Last onboarding open',
    onboardingProfileCreatedLabel: 'Onboarding profile created',
    warningsLabel: 'Warnings',
    selfTestLabel: 'Self test',
    incidentCategoriesLabel: 'Incident categories',
    recentIncidentDetailsLabel: 'Incident details',
    incidentLevelError: 'Error',
    incidentLevelWarn: 'Warn',
  },
} as const;

describe('settingsSupport utils', () => {
  it('formats uptime consistently', () => {
    expect(formatUptime(3661)).toBe('1h 1m 1s');
  });

  it('maps support labels and colors correctly', () => {
    expect(getSelfTestStatusLabel(t.settings, 'warn')).toBe('Warn');
    expect(getOnboardingStateLabel(t.settings, 'completed')).toBe('Completed');
    expect(getIncidentCategoryColor('extension')).toBe('geekblue');
    expect(getIncidentCategoryColor('unknown')).toBe('default');
  });

  it('builds support summary lines with optional sections', () => {
    const supportStatus = {
      appVersion: '1.0.0',
      nodeVersion: '22',
      platform: 'win32',
      arch: 'x64',
      uptimeSeconds: 3661,
      dataDir: 'E:/data',
      diagnosticsReady: true,
      onboardingCompleted: false,
      onboardingState: {
        status: 'in_progress',
        currentStep: 2,
        selectedRuntime: null,
        draftProfileName: null,
        lastOpenedAt: '2026-03-26T01:00:00.000Z',
        profileCreatedAt: null,
      },
      profileCount: 3,
      proxyCount: 2,
      backupCount: 1,
      feedbackCount: 4,
      usageMetrics: {
        profileCreates: 1,
        profileImports: 2,
        profileLaunches: 3,
        sessionChecks: 4,
        sessionCheckLoggedIn: 2,
        sessionCheckLoggedOut: 1,
        sessionCheckErrors: 1,
        lastProfileCreatedAt: '2026-03-26T01:02:00.000Z',
        lastProfileImportedAt: null,
        lastProfileLaunchAt: null,
        lastSessionCheckAt: null,
      },
      offlineSecretConfigured: true,
      codeSigningConfigured: false,
      supportPagesReady: true,
      releaseReady: false,
      recentIncidentCount: 2,
      recentErrorCount: 1,
      lastIncidentAt: '2026-03-26T01:03:00.000Z',
      recentIncidentCategories: [{ category: 'extension', label: 'Extension', count: 2, errorCount: 1 }],
      lastFeedbackAt: '2026-03-26T01:04:00.000Z',
      warnings: ['Needs config'],
      logFileCount: 5,
    } satisfies SupportStatus;

    const selfTestResult = {
      status: 'warn',
      checkedAt: '2026-03-26T01:05:00.000Z',
      checks: [{ key: 'cfg', label: 'Config', status: 'warn', detail: 'Missing file' }],
    } satisfies SelfTestResult;

    const incidentState = {
      summary: { categories: [{ category: 'extension', label: 'Extension', count: 2, errorCount: 1 }] },
      incidents: [{
        timestamp: '2026-03-26T01:06:00.000Z',
        level: 'error',
        source: 'extension',
        category: 'extension',
        categoryLabel: 'Extension',
        message: 'Crashed',
        fingerprint: 'fp-1',
      }],
      timeline: [],
    } satisfies SupportIncidentsResult;

    const lines = buildSupportSummaryLines({ t: t as never, supportStatus, selfTestResult, incidentState });

    expect(lines.some((line) => line.includes('Support summary'))).toBe(true);
    expect(lines.some((line) => line.includes('Warnings: Needs config'))).toBe(true);
    expect(lines.some((line) => line.includes('Self test: Warn'))).toBe(true);
    expect(lines.some((line) => line.includes('Incident details'))).toBe(true);
  });
});
