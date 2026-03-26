import type { useTranslation } from '../../shared/hooks/useTranslation';
import type {
  IncidentEntry,
  SelfTestResult,
  SupportFeedbackEntry,
  SupportIncidentsResult,
  SupportStatus,
} from '../../../shared/contracts';

type Translations = ReturnType<typeof useTranslation>['t'];

export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

export function getSelfTestStatusLabel(
  settings: Translations['settings'],
  status: SelfTestResult['status'],
): string {
  if (status === 'pass') return settings.statusPass;
  if (status === 'warn') return settings.statusWarn;
  return settings.statusFail;
}

export function getFeedbackCategoryLabel(
  settings: Translations['settings'],
  category: SupportFeedbackEntry['category'],
): string {
  if (category === 'bug') return settings.feedbackCategoryBug;
  if (category === 'question') return settings.feedbackCategoryQuestion;
  return settings.feedbackCategoryFeedback;
}

export function getFeedbackSentimentLabel(
  settings: Translations['settings'],
  sentiment: SupportFeedbackEntry['sentiment'],
): string {
  if (sentiment === 'positive') return settings.feedbackSentimentPositive;
  if (sentiment === 'negative') return settings.feedbackSentimentNegative;
  return settings.feedbackSentimentNeutral;
}

export function getIncidentLevelLabel(
  settings: Translations['settings'],
  level: IncidentEntry['level'],
): string {
  return level === 'error' ? settings.incidentLevelError : settings.incidentLevelWarn;
}

export function getIncidentCategoryColor(category: string): string {
  if (category === 'electron-process' || category === 'renderer-navigation') return 'volcano';
  if (category === 'startup-readiness' || category === 'runtime-launch') return 'orange';
  if (category === 'proxy') return 'gold';
  if (category === 'extension') return 'geekblue';
  if (category === 'cookies' || category === 'profile-package') return 'purple';
  if (category === 'support' || category === 'onboarding') return 'cyan';
  return 'default';
}

export function getOnboardingStateLabel(
  settings: Translations['settings'],
  status?: string | null,
): string {
  if (status === 'in_progress') return settings.onboardingStateInProgress;
  if (status === 'profile_created') return settings.onboardingStateProfileCreated;
  if (status === 'completed') return settings.onboardingStateCompleted;
  if (status === 'skipped') return settings.onboardingStateSkipped;
  return settings.onboardingStateNotStarted;
}

interface BuildSupportSummaryInput {
  t: Translations;
  supportStatus: SupportStatus;
  selfTestResult: SelfTestResult | null;
  incidentState: SupportIncidentsResult | null;
}

export interface SupportOverviewRow {
  key: string;
  label: string;
  value: string;
}

export interface SupportOverviewPresentation {
  rows: SupportOverviewRow[];
  warnings: string[];
}

interface BuildSupportOverviewInput {
  t: Translations;
  supportStatus: SupportStatus;
}

function formatOptionalTimestamp(value: string | null | undefined, fallback: string): string {
  return value ? new Date(value).toLocaleString() : fallback;
}

export function buildSupportOverviewPresentation({
  t,
  supportStatus,
}: BuildSupportOverviewInput): SupportOverviewPresentation {
  const settings = t.settings;
  const rows: SupportOverviewRow[] = [
    { key: 'app-version', label: settings.appVersionLabel, value: supportStatus.appVersion },
    { key: 'node-version', label: settings.nodeVersionLabel, value: supportStatus.nodeVersion },
    { key: 'platform', label: settings.platformLabel, value: `${supportStatus.platform} / ${supportStatus.arch}` },
    { key: 'uptime', label: settings.uptimeLabel, value: formatUptime(supportStatus.uptimeSeconds) },
    { key: 'data-dir', label: settings.dataDirLabel, value: supportStatus.dataDir },
    { key: 'log-files', label: settings.logFilesLabel, value: String(supportStatus.logFileCount) },
    {
      key: 'onboarding',
      label: settings.onboardingLabel,
      value: supportStatus.onboardingCompleted ? settings.statusCompleted : settings.statusPending,
    },
    {
      key: 'onboarding-state',
      label: settings.onboardingStateLabel,
      value: `${getOnboardingStateLabel(settings, supportStatus.onboardingState.status)} / ${settings.stepLabel} ${supportStatus.onboardingState.currentStep}`,
    },
    {
      key: 'onboarding-runtime',
      label: settings.onboardingRuntimeLabel,
      value: supportStatus.onboardingState.selectedRuntime ?? settings.noneValue,
    },
    {
      key: 'onboarding-draft-profile',
      label: settings.onboardingDraftProfileLabel,
      value: supportStatus.onboardingState.draftProfileName ?? settings.noneValue,
    },
    {
      key: 'last-onboarding-open',
      label: settings.lastOnboardingOpenLabel,
      value: formatOptionalTimestamp(supportStatus.onboardingState.lastOpenedAt, settings.noneValue),
    },
    { key: 'profiles', label: settings.profilesLabel, value: String(supportStatus.profileCount) },
    { key: 'proxies', label: settings.proxiesLabel, value: String(supportStatus.proxyCount) },
    { key: 'backups', label: settings.backupsLabel, value: String(supportStatus.backupCount) },
    { key: 'feedback-count', label: settings.feedbackInboxLabel, value: String(supportStatus.feedbackCount) },
    {
      key: 'last-feedback',
      label: settings.lastFeedbackLabel,
      value: formatOptionalTimestamp(supportStatus.lastFeedbackAt, settings.noneValue),
    },
    {
      key: 'usage',
      label: settings.usageLabel,
      value: `${supportStatus.usageMetrics.profileCreates} ${settings.createdLabel} / ${supportStatus.usageMetrics.profileImports} ${settings.importedLabel} / ${supportStatus.usageMetrics.profileLaunches} ${settings.launchesLabel}`,
    },
    {
      key: 'session-checks',
      label: settings.sessionChecksLabel,
      value: `${supportStatus.usageMetrics.sessionChecks} ${settings.totalLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedIn} ${settings.loggedInLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedOut} ${settings.loggedOutLabel} / ${supportStatus.usageMetrics.sessionCheckErrors} ${settings.errorsLabel}`,
    },
    {
      key: 'last-usage',
      label: settings.lastUsageLabel,
      value: supportStatus.usageMetrics.lastProfileLaunchAt
        ? `${settings.lastUsageLaunch} ${new Date(supportStatus.usageMetrics.lastProfileLaunchAt).toLocaleString()}`
        : supportStatus.usageMetrics.lastProfileCreatedAt
          ? `${settings.lastUsageCreate} ${new Date(supportStatus.usageMetrics.lastProfileCreatedAt).toLocaleString()}`
          : supportStatus.usageMetrics.lastProfileImportedAt
            ? `${settings.lastUsageImport} ${new Date(supportStatus.usageMetrics.lastProfileImportedAt).toLocaleString()}`
            : supportStatus.usageMetrics.lastSessionCheckAt
              ? `${settings.lastUsageSessionCheck} ${new Date(supportStatus.usageMetrics.lastSessionCheckAt).toLocaleString()}`
              : settings.noneValue,
    },
    {
      key: 'recent-incidents',
      label: settings.recentIncidentsLabel,
      value: `${supportStatus.recentIncidentCount} ${settings.totalLabel} / ${supportStatus.recentErrorCount} ${settings.errorsLabel}`,
    },
    {
      key: 'last-incident',
      label: settings.lastIncidentLabel,
      value: formatOptionalTimestamp(supportStatus.lastIncidentAt, settings.noneValue),
    },
    {
      key: 'top-incident-category',
      label: settings.topIncidentCategoryLabel,
      value: supportStatus.recentIncidentCategories[0]?.label ?? settings.noneValue,
    },
    {
      key: 'diagnostics',
      label: settings.diagnosticsLabel,
      value: supportStatus.diagnosticsReady ? settings.diagnosticsReadyState : settings.diagnosticsMissingState,
    },
    {
      key: 'offline-secret',
      label: settings.offlineSecretLabel,
      value: supportStatus.offlineSecretConfigured ? settings.configuredState : settings.missingState,
    },
    {
      key: 'code-signing',
      label: settings.codeSigningLabel,
      value: supportStatus.codeSigningConfigured ? settings.configuredState : settings.missingState,
    },
    {
      key: 'support-pages',
      label: settings.supportPagesLabel,
      value: supportStatus.supportPagesReady ? settings.readyState : settings.missingPagesState,
    },
    {
      key: 'release-readiness',
      label: settings.releaseReadinessLabel,
      value: supportStatus.releaseReady ? settings.readyState : settings.needsAttentionState,
    },
  ];

  return {
    rows,
    warnings: supportStatus.warnings,
  };
}

export function buildSupportSummaryLines({
  t,
  supportStatus,
  selfTestResult,
  incidentState,
}: BuildSupportSummaryInput): string[] {
  const settings = t.settings;
  const summaryLines = [
    settings.supportSummaryTitle,
    `${settings.appVersionLabel}: ${supportStatus.appVersion}`,
    `${settings.nodeVersionLabel}: ${supportStatus.nodeVersion}`,
    `${settings.platformLabel}: ${supportStatus.platform}/${supportStatus.arch}`,
    `${settings.uptimeLabel}: ${formatUptime(supportStatus.uptimeSeconds)}`,
    `${settings.dataDirLabel}: ${supportStatus.dataDir}`,
    `${settings.diagnosticsLabel}: ${supportStatus.diagnosticsReady ? settings.diagnosticsReadyState : settings.diagnosticsMissingState}`,
    `${settings.onboardingLabel}: ${supportStatus.onboardingCompleted ? settings.statusCompleted : settings.statusPending}`,
    `${settings.onboardingStateLabel}: ${getOnboardingStateLabel(settings, supportStatus.onboardingState.status)} (${settings.stepLabel} ${supportStatus.onboardingState.currentStep})`,
    `${settings.profilesLabel}: ${supportStatus.profileCount}`,
    `${settings.proxiesLabel}: ${supportStatus.proxyCount}`,
    `${settings.backupsLabel}: ${supportStatus.backupCount}`,
    `${settings.feedbackInboxLabel}: ${supportStatus.feedbackCount} ${settings.entriesLabel}`,
    `${settings.usageLabel}: ${supportStatus.usageMetrics.profileCreates} ${settings.createdLabel} / ${supportStatus.usageMetrics.profileImports} ${settings.importedLabel} / ${supportStatus.usageMetrics.profileLaunches} ${settings.launchesLabel}`,
    `${settings.sessionChecksLabel}: ${supportStatus.usageMetrics.sessionChecks} ${settings.totalLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedIn} ${settings.loggedInLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedOut} ${settings.loggedOutLabel} / ${supportStatus.usageMetrics.sessionCheckErrors} ${settings.errorsLabel}`,
    `${settings.offlineSecretLabel}: ${supportStatus.offlineSecretConfigured ? settings.configuredState : settings.missingState}`,
    `${settings.codeSigningLabel}: ${supportStatus.codeSigningConfigured ? settings.configuredState : settings.missingState}`,
    `${settings.supportPagesLabel}: ${supportStatus.supportPagesReady ? settings.readyState : settings.missingState}`,
    `${settings.releaseReadinessLabel}: ${supportStatus.releaseReady ? settings.readyState : settings.needsAttentionState}`,
    `${settings.recentIncidentsLabel}: ${supportStatus.recentIncidentCount} ${settings.totalLabel} / ${supportStatus.recentErrorCount} ${settings.errorsLabel}`,
    `${settings.lastIncidentLabel}: ${supportStatus.lastIncidentAt ? new Date(supportStatus.lastIncidentAt).toLocaleString() : settings.noneValue}`,
    `${settings.topIncidentCategoryLabel}: ${supportStatus.recentIncidentCategories[0]?.label ?? settings.noneValue}`,
  ];

  if (supportStatus.usageMetrics.lastProfileCreatedAt) {
    summaryLines.push(`${settings.lastProfileCreatedLabel}: ${new Date(supportStatus.usageMetrics.lastProfileCreatedAt).toLocaleString()}`);
  }
  if (supportStatus.usageMetrics.lastProfileImportedAt) {
    summaryLines.push(`${settings.lastProfileImportedLabel}: ${new Date(supportStatus.usageMetrics.lastProfileImportedAt).toLocaleString()}`);
  }
  if (supportStatus.usageMetrics.lastProfileLaunchAt) {
    summaryLines.push(`${settings.lastLaunchLabel}: ${new Date(supportStatus.usageMetrics.lastProfileLaunchAt).toLocaleString()}`);
  }
  if (supportStatus.usageMetrics.lastSessionCheckAt) {
    summaryLines.push(`${settings.lastSessionCheckLabel}: ${new Date(supportStatus.usageMetrics.lastSessionCheckAt).toLocaleString()}`);
  }
  if (supportStatus.onboardingState.lastOpenedAt) {
    summaryLines.push(`${settings.lastOnboardingOpenLabel}: ${new Date(supportStatus.onboardingState.lastOpenedAt).toLocaleString()}`);
  }
  if (supportStatus.onboardingState.profileCreatedAt) {
    summaryLines.push(`${settings.onboardingProfileCreatedLabel}: ${new Date(supportStatus.onboardingState.profileCreatedAt).toLocaleString()}`);
  }
  if (supportStatus.lastFeedbackAt) {
    summaryLines.push(`Last feedback: ${new Date(supportStatus.lastFeedbackAt).toLocaleString()}`);
  }

  if (supportStatus.warnings.length > 0) {
    summaryLines.push(`${settings.warningsLabel}: ${supportStatus.warnings.join(' | ')}`);
  } else {
    summaryLines.push(`${settings.warningsLabel}: ${settings.noneValue}`);
  }

  if (selfTestResult) {
    summaryLines.push(`${settings.selfTestLabel}: ${getSelfTestStatusLabel(settings, selfTestResult.status)} @ ${new Date(selfTestResult.checkedAt).toLocaleString()}`);
    summaryLines.push(
      ...selfTestResult.checks.map((check) =>
        `- ${check.label}: ${getSelfTestStatusLabel(settings, check.status)} (${check.detail})`),
    );
  }

  if (incidentState && incidentState.incidents.length > 0) {
    if (incidentState.summary.categories.length > 0) {
      summaryLines.push(
        `${settings.incidentCategoriesLabel}: ${incidentState.summary.categories
          .slice(0, 4)
          .map((category) => `${category.label} (${category.count})`)
          .join(', ')}`,
      );
    }
    summaryLines.push(settings.recentIncidentDetailsLabel);
    summaryLines.push(
      ...incidentState.incidents.slice(0, 5).map((incident) =>
        `- [${getIncidentLevelLabel(settings, incident.level)} | ${incident.categoryLabel}] ${incident.source} @ ${new Date(incident.timestamp).toLocaleString()}: ${incident.message}`),
    );
  }

  return summaryLines;
}
