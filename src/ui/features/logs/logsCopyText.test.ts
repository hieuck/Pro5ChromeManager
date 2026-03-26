import { describe, expect, it } from 'vitest';
import type { ParsedLogEntry } from './logParsing';
import {
  buildIssueDigestText,
  buildRecentIssueSourceDigestText,
  buildVisibleSliceSummaryText,
  buildVisibleTopSourceSummaryText,
  type LogsCopyTextContext,
} from './logsCopyText';
import type { VisibleSourceSummary } from './logsState.utils';

function createEntry(overrides: Partial<ParsedLogEntry> = {}): ParsedLogEntry {
  return {
    timestamp: '2026-03-26T11:59:00.000Z',
    level: 'error',
    message: 'Proxy failed',
    raw: '{"level":"error","message":"Proxy failed"}',
    source: 'proxy',
    ...overrides,
  };
}

const context: LogsCopyTextContext = {
  labels: {
    yes: 'Yes',
    no: 'No',
    noneValue: 'None',
    unknownValue: 'Unknown',
    levelLabel: 'Level',
    timestampLabel: 'Timestamp',
    messageLabel: 'Message',
    rawLabel: 'Raw',
    sourceLabel: 'Source',
    visibleLogSliceTitle: 'Visible slice',
    visibleEntriesLabel: 'Visible entries',
    visibleErrorsLabel: 'Errors',
    visibleWarningsLabel: 'Warnings',
    visibleDebugLabel: 'Debug',
    visibleInfoLabel: 'Info',
    visibleHeatLabel: 'Heat',
    levelFilterLabel: 'Filter',
    recentWindowOnlyLabel: 'Recent only',
    sortOrderLabel: 'Sort',
    searchLabel: 'Search',
    visibleIssuesLast15Label: 'Issues 15m',
    visibleIssuesLast60Label: 'Issues 60m',
    latestVisibleIssueLabel: 'Latest issue',
    latestVisibleSourceLabel: 'Latest source',
    recentIssueSourceLatestTitle: 'Recent source latest',
    repeatedRecentIssuesTitle: 'Repeated issues',
    repeatedRecentSourcesTitle: 'Repeated sources',
    visibleSourceLatestTitle: 'Visible source latest',
    visibleLinesLabel: 'Visible lines',
    visibleSourceActionHintLabel: 'Action',
    visibleTopSourceTimestampLabel: 'Top source timestamp',
    visibleTopSourceTrendLabel: 'Top source trend',
    visibleTopSourceSummaryTitle: 'Top source summary',
    visibleTopSourceShareLabel: 'Top source share',
    visibleTopSourcesConcentrationLabel: 'Concentration',
    visibleSourceModeLabel: 'Mode',
    latestLevelLabel: 'Latest level',
    latestMessageLabel: 'Latest message',
    visibleSourceDigestTitle: 'Visible source digest',
    visibleSourceModeHintLabel: 'Mode hint',
    visibleTopSourceFreshnessLabel: 'Freshness',
    latestTimestampLabel: 'Latest timestamp',
    latestRawLabel: 'Latest raw',
    visibleSourcesDigestTitle: 'Visible sources',
    recentIssueSourceDigestTitle: 'Recent source digest',
    issueLines60mLabel: 'Issue lines 60m',
    highestLevelLabel: 'Highest level',
    latestIssueLevelLabel: 'Latest issue level',
    latestIssueTimestampLabel: 'Latest issue timestamp',
    latestIssueMessageLabel: 'Latest issue message',
    latestIssueRawLabel: 'Latest issue raw',
    logDigestTitle: 'Log digest',
    issuesLabel: 'Issues',
    activeFilterLabel: 'Active filter',
    recentIncidentDigestTitle: 'Recent issue digest',
    incidentsLast60Label: 'Incidents 60m',
    recentErrorsLabel: 'Recent errors',
    recentWarningsLabel: 'Recent warnings',
    latestRecentIssueLabel: 'Latest recent issue',
  },
  formatters: {
    formatIssueSummary: (entry) => entry ? `${entry.level}:${entry.message}` : 'None',
    formatMaybeValue: (value, fallback = 'None') => value && value.trim() ? value : fallback,
    getLogLevelLabel: (level) => String(level).toUpperCase(),
    getSortOrderLabel: (order) => order.toUpperCase(),
  },
};

describe('logsCopyText', () => {
  it('builds the visible slice summary from view state', () => {
    const text = buildVisibleSliceSummaryText(context, {
      totalEntries: 12,
      visibleEntries: 3,
      filteredCounts: { debug: 0, info: 1, warn: 1, error: 1 },
      visibleTrendLabel: 'Elevated',
      filter: 'issues',
      recentWindowOnly: true,
      sortOrder: 'newest',
      query: 'proxy',
      visibleIssueTrend: { last15m: 2, last60m: 4 },
      latestVisibleIssue: createEntry(),
    });

    expect(text).toContain('Visible entries: 3/12');
    expect(text).toContain('Recent only: Yes');
    expect(text).toContain('Latest issue: error:Proxy failed');
  });

  it('builds visible top source summaries with share and trend data', () => {
    const source: VisibleSourceSummary = {
      source: 'proxy',
      count: 4,
      latestEntry: createEntry(),
    };

    const text = buildVisibleTopSourceSummaryText(context, {
      source,
      sharePercent: 67,
      concentrationPercent: 80,
      modeLabel: 'Focused',
      actionHint: 'Inspect immediately',
      topSourceTimestamp: '2026-03-26 18:59',
      topSourceTrend: { last15m: 3, last60m: 6, label: 'Hot' },
    });

    expect(text).toContain('Top source share: 67%');
    expect(text).toContain('Mode: Focused');
    expect(text).toContain('Top source trend: Hot | 15m=3 | 60m=6');
  });

  it('builds issue digests and recent source digests with latest entry details', () => {
    const issueDigest = buildIssueDigestText(context, {
      totalEntries: 20,
      visibleEntries: 8,
      issueCount: 5,
      filteredCounts: { debug: 1, info: 2, warn: 2, error: 3 },
      filter: 'warn',
      recentWindowOnly: false,
      sortOrder: 'oldest',
      query: 'proxy',
      latestVisibleIssue: createEntry(),
    });

    const recentSourceDigest = buildRecentIssueSourceDigestText(context, {
      source: 'proxy',
      count: 3,
      level: 'error',
      latestEntry: createEntry(),
    });

    expect(issueDigest).toContain('Active filter: WARN');
    expect(issueDigest).toContain('Search: proxy');
    expect(recentSourceDigest).toContain('Issue lines 60m: 3');
    expect(recentSourceDigest).toContain('Latest issue message: Proxy failed');
  });
});
