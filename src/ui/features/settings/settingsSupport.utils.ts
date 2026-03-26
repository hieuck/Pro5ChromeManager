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
