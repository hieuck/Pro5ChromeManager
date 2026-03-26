import type { LogEntry } from './types';

export interface DashboardActivityCopyLabels {
  logHeatLabel: string;
  hottestIssueDigestTitle: string;
  hottestIssueRepeatsDigestLabel: string;
  levelLabel: string;
  timestampLabel: string;
  messageLabel: string;
  rawLabel: string;
  activityDigestTitle: string;
  activityEntriesDigestLabel: string;
  activityIssues15Label: string;
  activityIssues60Label: string;
  errorCountLabel: string;
  warningCountLabel: string;
  debugCountLabel: string;
  infoCountLabel: string;
  issueRatioLabel: string;
  activitySignalModeLabel: string;
  activitySignalHintLabel: string;
  activityFreshnessLabel: string;
  latestActivityLevelLabel: string;
  topActivitySourceDigestLabel: string;
  topActivitySourceLatestDigestLabel: string;
  topActivitySourceFreshnessDigestLabel: string;
  topActivitySourceLatestLevelDigestLabel: string;
  topActivitySourceLatestMessageDigestLabel: string;
  topActivitySourceShareLabel: string;
  topActivitySourcesConcentrationLabel: string;
  activitySourceModeLabel: string;
  activitySourceModeHintLabel: string;
  hottestIssueFreshnessLabel: string;
  hottestIssueLevelLabel: string;
  latestActivityDigestLabel: string;
  latestMessageLabel: string;
  latestSourceDigestLabel: string;
  topIssuesDigestLabel: string;
  topActivitySourcesDigestLabel: string;
  latestActivityDigestTitle: string;
  topActivityIssuesDigestTitle: string;
  topActivitySourceLatestDigestTitle: string;
  sourceLabel: string;
  countLabel: string;
  freshnessLabel: string;
  levelTextLabel: string;
  topActivitySourcesDigestTitle: string;
}

export interface DashboardActivityCopyFormatters {
  formatActivitySummary: (entry?: LogEntry | null) => string;
  formatTimestamp: (value: string) => string;
  getLogLevelLabel: (level: LogEntry['level']) => string;
}

export interface DashboardActivityCopyContext {
  labels: DashboardActivityCopyLabels;
  formatters: DashboardActivityCopyFormatters;
}

function joinLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter(Boolean).join('\n');
}

export function buildHottestIssueDigestText(
  context: DashboardActivityCopyContext,
  input: { logHeatLabel: string; count: number; entry: LogEntry },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.hottestIssueDigestTitle,
    `${labels.logHeatLabel}: ${input.logHeatLabel}`,
    `${labels.hottestIssueRepeatsDigestLabel}: ${input.count}`,
    `${labels.levelLabel}: ${formatters.getLogLevelLabel(input.entry.level)}`,
    `${labels.timestampLabel}: ${formatters.formatTimestamp(input.entry.timestamp)}`,
    `${labels.messageLabel}: ${input.entry.message}`,
    `${labels.rawLabel}: ${input.entry.raw}`,
  ]);
}

export function buildActivityDigestText(
  context: DashboardActivityCopyContext,
  input: {
    logHeatLabel: string;
    total: number;
    issues15: number;
    issues60: number;
    errors: number;
    warnings: number;
    debugs: number;
    infos: number;
    issueRatio: number;
    activitySignalMode: { label: string; hint: string };
    activityFreshness: { label: string };
    latestActivityLevel: { label: string };
    topSource: [string, number] | null;
    topSourceLatestEntry: LogEntry | null;
    topSourceLatestFreshness: { label: string };
    topSourceLatestLevel: { label: string };
    topSourceShare: number;
    topSourcesConcentration: number;
    activitySourceMode: { label: string; hint: string };
    hottestRecentIssue: { count: number } | null;
    hottestIssueFreshness: { label: string };
    hottestIssueLevel: { label: string };
    latestEntry: LogEntry;
    topRecentIssues: Array<{ entry: LogEntry; count: number }>;
    topSources: Array<[string, number]>;
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.activityDigestTitle,
    `${labels.logHeatLabel}: ${input.logHeatLabel}`,
    `${labels.activityEntriesDigestLabel}: ${input.total}`,
    `${labels.activityIssues15Label}: ${input.issues15}`,
    `${labels.activityIssues60Label}: ${input.issues60}`,
    `${labels.errorCountLabel}: ${input.errors}`,
    `${labels.warningCountLabel}: ${input.warnings}`,
    `${labels.debugCountLabel}: ${input.debugs}`,
    `${labels.infoCountLabel}: ${input.infos}`,
    `${labels.issueRatioLabel}: ${input.issueRatio}%`,
    `${labels.activitySignalModeLabel}: ${input.activitySignalMode.label}`,
    `${labels.activitySignalHintLabel}: ${input.activitySignalMode.hint}`,
    `${labels.activityFreshnessLabel}: ${input.activityFreshness.label}`,
    `${labels.latestActivityLevelLabel}: ${input.latestActivityLevel.label}`,
    input.topSource ? `${labels.topActivitySourceDigestLabel}: ${input.topSource[0]} (${input.topSource[1]})` : null,
    input.topSourceLatestEntry ? `${labels.topActivitySourceLatestDigestLabel}: ${formatters.formatActivitySummary(input.topSourceLatestEntry)}` : null,
    input.topSourceLatestEntry ? `${labels.topActivitySourceFreshnessDigestLabel}: ${input.topSourceLatestFreshness.label}` : null,
    input.topSourceLatestEntry ? `${labels.topActivitySourceLatestLevelDigestLabel}: ${input.topSourceLatestLevel.label}` : null,
    input.topSourceLatestEntry ? `${labels.topActivitySourceLatestMessageDigestLabel}: ${input.topSourceLatestEntry.message}` : null,
    `${labels.topActivitySourceShareLabel}: ${input.topSourceShare}%`,
    `${labels.topActivitySourcesConcentrationLabel}: ${input.topSourcesConcentration}%`,
    `${labels.activitySourceModeLabel}: ${input.activitySourceMode.label}`,
    `${labels.activitySourceModeHintLabel}: ${input.activitySourceMode.hint}`,
    input.hottestRecentIssue ? `${labels.hottestIssueRepeatsDigestLabel}: ${input.hottestRecentIssue.count}` : null,
    input.hottestRecentIssue ? `${labels.hottestIssueFreshnessLabel}: ${input.hottestIssueFreshness.label}` : null,
    input.hottestRecentIssue ? `${labels.hottestIssueLevelLabel}: ${input.hottestIssueLevel.label}` : null,
    `${labels.latestActivityDigestLabel}: ${formatters.formatActivitySummary(input.latestEntry)}`,
    `${labels.latestMessageLabel}: ${input.latestEntry.message}`,
    input.latestEntry.source ? `${labels.latestSourceDigestLabel}: ${input.latestEntry.source}` : null,
    input.topRecentIssues.length ? `${labels.topIssuesDigestLabel}: ${input.topRecentIssues.map((issue) => `${issue.entry.message} (${issue.count})`).join(', ')}` : null,
    input.topSources.length ? `${labels.topActivitySourcesDigestLabel}: ${input.topSources.map(([source, count]) => `${source} (${count})`).join(', ')}` : null,
  ]);
}

export function buildLatestActivityDigestText(
  context: DashboardActivityCopyContext,
  entry: LogEntry,
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.latestActivityDigestTitle,
    `${labels.levelLabel}: ${formatters.getLogLevelLabel(entry.level)}`,
    `${labels.timestampLabel}: ${formatters.formatTimestamp(entry.timestamp)}`,
    `${labels.messageLabel}: ${entry.message}`,
    `${labels.rawLabel}: ${entry.raw}`,
  ]);
}

export function buildTopActivityIssuesText(
  context: DashboardActivityCopyContext,
  logHeatLabel: string,
  issues: Array<{ entry: LogEntry; count: number }>,
): string {
  const { labels } = context;
  return joinLines([
    labels.topActivityIssuesDigestTitle,
    `${labels.logHeatLabel}: ${logHeatLabel}`,
    ...issues.map((issue, index) => `${index + 1}. ${issue.entry.message} (${issue.count})`),
  ]);
}

export function buildTopActivitySourceLatestText(
  context: DashboardActivityCopyContext,
  input: {
    source: [string, number];
    entry: LogEntry;
    freshnessLabel: string;
    levelText: string;
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.topActivitySourceLatestDigestTitle,
    `${labels.sourceLabel}: ${input.source[0]}`,
    `${labels.countLabel}: ${input.source[1]}`,
    `${labels.levelLabel}: ${formatters.getLogLevelLabel(input.entry.level)}`,
    `${labels.timestampLabel}: ${formatters.formatTimestamp(input.entry.timestamp)}`,
    `${labels.freshnessLabel}: ${input.freshnessLabel}`,
    `${labels.levelTextLabel}: ${input.levelText}`,
    `${labels.messageLabel}: ${input.entry.message}`,
    `${labels.rawLabel}: ${input.entry.raw}`,
  ]);
}

export function buildTopActivitySourcesText(
  context: DashboardActivityCopyContext,
  input: {
    modeLabel: string;
    topSourceShare: number;
    topSourcesConcentration: number;
    topSources: Array<[string, number]>;
  },
): string {
  const { labels } = context;
  return joinLines([
    labels.topActivitySourcesDigestTitle,
    `${labels.activitySourceModeLabel}: ${input.modeLabel}`,
    `${labels.topActivitySourceShareLabel}: ${input.topSourceShare}%`,
    `${labels.topActivitySourcesConcentrationLabel}: ${input.topSourcesConcentration}%`,
    ...input.topSources.map(([source, count], index) => `${index + 1}. ${source} (${count})`),
  ]);
}
