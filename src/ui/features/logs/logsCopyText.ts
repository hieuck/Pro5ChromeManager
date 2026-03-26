import type { ParsedLogEntry } from './logParsing';
import type {
  LogsFilter,
  LogsSortOrder,
  RepeatedRecentIssueSummary,
  RepeatedRecentSourceSummary,
  VisibleSourceSummary,
} from './logsState.utils';

export interface LogsCopyTextLabels {
  yes: string;
  no: string;
  noneValue: string;
  unknownValue: string;
  levelLabel: string;
  timestampLabel: string;
  messageLabel: string;
  rawLabel: string;
  sourceLabel: string;
  visibleLogSliceTitle: string;
  visibleEntriesLabel: string;
  visibleErrorsLabel: string;
  visibleWarningsLabel: string;
  visibleDebugLabel: string;
  visibleInfoLabel: string;
  visibleHeatLabel: string;
  levelFilterLabel: string;
  recentWindowOnlyLabel: string;
  sortOrderLabel: string;
  searchLabel: string;
  visibleIssuesLast15Label: string;
  visibleIssuesLast60Label: string;
  latestVisibleIssueLabel: string;
  latestVisibleSourceLabel: string;
  recentIssueSourceLatestTitle: string;
  repeatedRecentIssuesTitle: string;
  repeatedRecentSourcesTitle: string;
  visibleSourceLatestTitle: string;
  visibleLinesLabel: string;
  visibleSourceActionHintLabel: string;
  visibleTopSourceTimestampLabel: string;
  visibleTopSourceTrendLabel: string;
  visibleTopSourceSummaryTitle: string;
  visibleTopSourceShareLabel: string;
  visibleTopSourcesConcentrationLabel: string;
  visibleSourceModeLabel: string;
  latestLevelLabel: string;
  latestMessageLabel: string;
  visibleSourceDigestTitle: string;
  visibleSourceModeHintLabel: string;
  visibleTopSourceFreshnessLabel: string;
  latestTimestampLabel: string;
  latestRawLabel: string;
  visibleSourcesDigestTitle: string;
  recentIssueSourceDigestTitle: string;
  issueLines60mLabel: string;
  highestLevelLabel: string;
  latestIssueLevelLabel: string;
  latestIssueTimestampLabel: string;
  latestIssueMessageLabel: string;
  latestIssueRawLabel: string;
  logDigestTitle: string;
  issuesLabel: string;
  activeFilterLabel: string;
  recentIncidentDigestTitle: string;
  incidentsLast60Label: string;
  recentErrorsLabel: string;
  recentWarningsLabel: string;
  latestRecentIssueLabel: string;
}

export interface LogsCopyTextFormatters {
  formatIssueSummary: (entry: ParsedLogEntry | null | undefined, emptyLabel?: string) => string;
  formatMaybeValue: (value: string | null | undefined, fallback?: string) => string;
  getLogLevelLabel: (level: ParsedLogEntry['level'] | 'all' | 'issues') => string;
  getSortOrderLabel: (order: LogsSortOrder) => string;
}

export interface LogsCopyTextContext {
  labels: LogsCopyTextLabels;
  formatters: LogsCopyTextFormatters;
}

function joinLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter(Boolean).join('\n');
}

export function buildLogEntryDetailsText(
  context: LogsCopyTextContext,
  entry: ParsedLogEntry,
): string {
  const { labels, formatters } = context;
  return joinLines([
    `${labels.levelLabel}: ${formatters.getLogLevelLabel(entry.level)}`,
    `${labels.timestampLabel}: ${formatters.formatMaybeValue(entry.timestamp, labels.unknownValue)}`,
    `${labels.messageLabel}: ${entry.message}`,
    `${labels.rawLabel}: ${entry.raw}`,
  ]);
}

export function buildVisibleSliceSummaryText(
  context: LogsCopyTextContext,
  input: {
    totalEntries: number;
    visibleEntries: number;
    filteredCounts: { debug: number; info: number; warn: number; error: number };
    visibleTrendLabel: string;
    filter: LogsFilter;
    recentWindowOnly: boolean;
    sortOrder: LogsSortOrder;
    query: string;
    visibleIssueTrend: { last15m: number; last60m: number };
    latestVisibleIssue: ParsedLogEntry | null;
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.visibleLogSliceTitle,
    `${labels.visibleEntriesLabel}: ${input.visibleEntries}/${input.totalEntries}`,
    `${labels.visibleErrorsLabel}: ${input.filteredCounts.error}`,
    `${labels.visibleWarningsLabel}: ${input.filteredCounts.warn}`,
    `${labels.visibleDebugLabel}: ${input.filteredCounts.debug}`,
    `${labels.visibleInfoLabel}: ${input.filteredCounts.info}`,
    `${labels.visibleHeatLabel}: ${input.visibleTrendLabel}`,
    `${labels.levelFilterLabel}: ${formatters.getLogLevelLabel(input.filter)}`,
    `${labels.recentWindowOnlyLabel}: ${input.recentWindowOnly ? labels.yes : labels.no}`,
    `${labels.sortOrderLabel}: ${formatters.getSortOrderLabel(input.sortOrder)}`,
    `${labels.searchLabel}: ${formatters.formatMaybeValue(input.query.trim())}`,
    `${labels.visibleIssuesLast15Label}: ${input.visibleIssueTrend.last15m}`,
    `${labels.visibleIssuesLast60Label}: ${input.visibleIssueTrend.last60m}`,
    `${labels.latestVisibleIssueLabel}: ${formatters.formatIssueSummary(input.latestVisibleIssue)}`,
    `${labels.latestVisibleSourceLabel}: ${formatters.formatMaybeValue(input.latestVisibleIssue?.source)}`,
  ]);
}

export function buildRecentIssueSourceLatestText(
  context: LogsCopyTextContext,
  source: string,
  entry: ParsedLogEntry,
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.recentIssueSourceLatestTitle,
    `${labels.sourceLabel}: ${source}`,
    `${labels.levelLabel}: ${formatters.getLogLevelLabel(entry.level)}`,
    `${labels.timestampLabel}: ${formatters.formatMaybeValue(entry.timestamp, labels.unknownValue)}`,
    `${labels.messageLabel}: ${entry.message}`,
    `${labels.rawLabel}: ${entry.raw}`,
  ]);
}

export function buildRepeatedRecentIssuesText(
  context: LogsCopyTextContext,
  issues: RepeatedRecentIssueSummary[],
): string {
  const { labels } = context;
  return joinLines([
    labels.repeatedRecentIssuesTitle,
    ...issues.map((issue) => `${issue.level.toUpperCase()} | ${issue.count}x | ${issue.message}`),
  ]);
}

export function buildRepeatedRecentSourcesText(
  context: LogsCopyTextContext,
  sources: RepeatedRecentSourceSummary[],
): string {
  const { labels } = context;
  return joinLines([
    labels.repeatedRecentSourcesTitle,
    ...sources.map((source) => `${source.level.toUpperCase()} | ${source.count}x | ${source.source}`),
  ]);
}

export function buildVisibleSourceLatestText(
  context: LogsCopyTextContext,
  input: {
    source: VisibleSourceSummary;
    actionHint: string;
    topSourceTimestamp: string;
    topSourceTrend: { last15m: number; last60m: number; label: string };
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.visibleSourceLatestTitle,
    `${labels.sourceLabel}: ${input.source.source}`,
    `${labels.visibleLinesLabel}: ${input.source.count}`,
    `${labels.visibleSourceActionHintLabel}: ${input.actionHint}`,
    `${labels.visibleTopSourceTimestampLabel}: ${input.topSourceTimestamp}`,
    `${labels.visibleTopSourceTrendLabel}: ${input.topSourceTrend.label} | 15m=${input.topSourceTrend.last15m} | 60m=${input.topSourceTrend.last60m}`,
    `${labels.levelLabel}: ${formatters.getLogLevelLabel(input.source.latestEntry.level)}`,
    `${labels.timestampLabel}: ${formatters.formatMaybeValue(input.source.latestEntry.timestamp, labels.unknownValue)}`,
    `${labels.messageLabel}: ${input.source.latestEntry.message}`,
    `${labels.rawLabel}: ${input.source.latestEntry.raw}`,
  ]);
}

export function buildVisibleTopSourceSummaryText(
  context: LogsCopyTextContext,
  input: {
    source: VisibleSourceSummary;
    sharePercent: number;
    concentrationPercent: number;
    modeLabel: string;
    actionHint: string;
    topSourceTimestamp: string;
    topSourceTrend: { last15m: number; last60m: number; label: string };
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.visibleTopSourceSummaryTitle,
    `${labels.sourceLabel}: ${input.source.source}`,
    `${labels.visibleLinesLabel}: ${input.source.count}`,
    `${labels.visibleTopSourceShareLabel}: ${input.sharePercent}%`,
    `${labels.visibleTopSourcesConcentrationLabel}: ${input.concentrationPercent}%`,
    `${labels.visibleSourceModeLabel}: ${input.modeLabel}`,
    `${labels.visibleSourceActionHintLabel}: ${input.actionHint}`,
    `${labels.visibleTopSourceTimestampLabel}: ${input.topSourceTimestamp}`,
    `${labels.visibleTopSourceTrendLabel}: ${input.topSourceTrend.label} | 15m=${input.topSourceTrend.last15m} | 60m=${input.topSourceTrend.last60m}`,
    `${labels.latestLevelLabel}: ${formatters.getLogLevelLabel(input.source.latestEntry.level)}`,
    `${labels.latestMessageLabel}: ${input.source.latestEntry.message}`,
  ]);
}

export function buildVisibleSourceDigestText(
  context: LogsCopyTextContext,
  input: {
    source: VisibleSourceSummary;
    sharePercent: number;
    concentrationPercent: number;
    mode: { label: string; hint: string };
    actionHint: string;
    topSourceFreshness: string;
    topSourceTimestamp: string;
    topSourceTrend: { last15m: number; last60m: number; label: string };
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.visibleSourceDigestTitle,
    `${labels.sourceLabel}: ${input.source.source}`,
    `${labels.visibleLinesLabel}: ${input.source.count}`,
    `${labels.visibleTopSourceShareLabel}: ${input.sharePercent}%`,
    `${labels.visibleTopSourcesConcentrationLabel}: ${input.concentrationPercent}%`,
    `${labels.visibleSourceModeLabel}: ${input.mode.label}`,
    `${labels.visibleSourceModeHintLabel}: ${input.mode.hint}`,
    `${labels.visibleSourceActionHintLabel}: ${input.actionHint}`,
    `${labels.visibleTopSourceFreshnessLabel}: ${input.topSourceFreshness}`,
    `${labels.visibleTopSourceTimestampLabel}: ${input.topSourceTimestamp}`,
    `${labels.visibleTopSourceTrendLabel}: ${input.topSourceTrend.label} | 15m=${input.topSourceTrend.last15m} | 60m=${input.topSourceTrend.last60m}`,
    `${labels.latestLevelLabel}: ${formatters.getLogLevelLabel(input.source.latestEntry.level)}`,
    `${labels.latestTimestampLabel}: ${formatters.formatMaybeValue(input.source.latestEntry.timestamp, labels.unknownValue)}`,
    `${labels.latestMessageLabel}: ${input.source.latestEntry.message}`,
    `${labels.latestRawLabel}: ${input.source.latestEntry.raw}`,
  ]);
}

export function buildVisibleSourcesText(
  context: LogsCopyTextContext,
  input: {
    sources: VisibleSourceSummary[];
    sharePercent: number;
    concentrationPercent: number;
    mode: { label: string; hint: string };
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.visibleSourcesDigestTitle,
    `${labels.visibleTopSourceShareLabel}: ${input.sharePercent}%`,
    `${labels.visibleTopSourcesConcentrationLabel}: ${input.concentrationPercent}%`,
    `${labels.visibleSourceModeLabel}: ${input.mode.label}`,
    `${labels.visibleSourceModeHintLabel}: ${input.mode.hint}`,
    ...input.sources.map((source) => `${source.count}x | ${source.source} | ${formatters.getLogLevelLabel(source.latestEntry.level)} | ${source.latestEntry.message}`),
  ]);
}

export function buildRecentIssueSourceDigestText(
  context: LogsCopyTextContext,
  source: RepeatedRecentSourceSummary,
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.recentIssueSourceDigestTitle,
    `${labels.sourceLabel}: ${source.source}`,
    `${labels.issueLines60mLabel}: ${source.count}`,
    `${labels.highestLevelLabel}: ${formatters.getLogLevelLabel(source.level)}`,
    `${labels.latestIssueLevelLabel}: ${formatters.getLogLevelLabel(source.latestEntry.level)}`,
    `${labels.latestIssueTimestampLabel}: ${formatters.formatMaybeValue(source.latestEntry.timestamp, labels.unknownValue)}`,
    `${labels.latestIssueMessageLabel}: ${source.latestEntry.message}`,
    `${labels.latestIssueRawLabel}: ${source.latestEntry.raw}`,
  ]);
}

export function buildIssueDigestText(
  context: LogsCopyTextContext,
  input: {
    totalEntries: number;
    visibleEntries: number;
    issueCount: number;
    filteredCounts: { debug: number; info: number; warn: number; error: number };
    filter: LogsFilter;
    recentWindowOnly: boolean;
    sortOrder: LogsSortOrder;
    query: string;
    latestVisibleIssue: ParsedLogEntry | null;
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.logDigestTitle,
    `${labels.visibleEntriesLabel}: ${input.visibleEntries}/${input.totalEntries}`,
    `${labels.issuesLabel}: ${input.issueCount}`,
    `${labels.visibleErrorsLabel}: ${input.filteredCounts.error}`,
    `${labels.visibleWarningsLabel}: ${input.filteredCounts.warn}`,
    `${labels.visibleDebugLabel}: ${input.filteredCounts.debug}`,
    `${labels.visibleInfoLabel}: ${input.filteredCounts.info}`,
    `${labels.activeFilterLabel}: ${formatters.getLogLevelLabel(input.filter)}`,
    `${labels.recentWindowOnlyLabel}: ${input.recentWindowOnly ? labels.yes : labels.no}`,
    `${labels.sortOrderLabel}: ${formatters.getSortOrderLabel(input.sortOrder)}`,
    `${labels.searchLabel}: ${formatters.formatMaybeValue(input.query.trim())}`,
    `${labels.latestVisibleIssueLabel}: ${formatters.formatIssueSummary(input.latestVisibleIssue)}`,
    `${labels.latestVisibleSourceLabel}: ${formatters.formatMaybeValue(input.latestVisibleIssue?.source)}`,
  ]);
}

export function buildRecentIssueDigestText(
  context: LogsCopyTextContext,
  input: {
    recentIssueCount: number;
    recentIssueBreakdown: { error: number; warn: number };
    latestRecentIssue: ParsedLogEntry | null;
  },
): string {
  const { labels, formatters } = context;
  return joinLines([
    labels.recentIncidentDigestTitle,
    `${labels.incidentsLast60Label}: ${input.recentIssueCount}`,
    `${labels.recentErrorsLabel}: ${input.recentIssueBreakdown.error}`,
    `${labels.recentWarningsLabel}: ${input.recentIssueBreakdown.warn}`,
    `${labels.latestRecentIssueLabel}: ${formatters.formatIssueSummary(input.latestRecentIssue)}`,
  ]);
}
