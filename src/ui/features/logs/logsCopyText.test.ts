import { describe, expect, it } from 'vitest';
import type { ParsedLogEntry } from './logParsing';
import {
  buildLogEntryDetailsText,
  buildIssueDigestText,
  buildRecentIssueDigestText,
  buildRecentIssueSourceLatestText,
  buildRecentIssueSourceDigestText,
  buildRepeatedRecentIssuesText,
  buildRepeatedRecentSourcesText,
  buildVisibleSourceDigestText,
  buildVisibleSourceLatestText,
  buildVisibleSliceSummaryText,
  buildVisibleSourcesText,
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

  it('builds detailed log entry and recent source latest text blocks', () => {
    const entry = createEntry();

    const entryDetails = buildLogEntryDetailsText(context, entry);
    const sourceLatest = buildRecentIssueSourceLatestText(context, 'proxy', entry);

    expect(entryDetails).toContain('Level: ERROR');
    expect(entryDetails).toContain('Raw: {"level":"error","message":"Proxy failed"}');
    expect(sourceLatest).toContain('Source: proxy');
    expect(sourceLatest).toContain('Message: Proxy failed');
  });

  it('builds repeated issue and repeated source summaries', () => {
    const repeatedIssues = buildRepeatedRecentIssuesText(context, [
      { count: 4, level: 'warn', message: 'Proxy warming up' },
    ]);
    const repeatedSources = buildRepeatedRecentSourcesText(context, [
      { count: 3, level: 'error', source: 'proxy', latestEntry: createEntry() },
    ]);

    expect(repeatedIssues).toContain('WARN | 4x | Proxy warming up');
    expect(repeatedSources).toContain('ERROR | 3x | proxy');
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

  it('builds visible source latest, digest, and aggregate source summaries', () => {
    const source: VisibleSourceSummary = {
      source: 'proxy',
      count: 4,
      latestEntry: createEntry({
        timestamp: '',
      }),
    };

    const latestText = buildVisibleSourceLatestText(context, {
      source,
      actionHint: 'Inspect immediately',
      topSourceTimestamp: '2026-03-26 18:59',
      topSourceTrend: { last15m: 3, last60m: 6, label: 'Hot' },
    });
    const digestText = buildVisibleSourceDigestText(context, {
      source,
      sharePercent: 67,
      concentrationPercent: 80,
      mode: { label: 'Focused', hint: 'Mostly one source' },
      actionHint: 'Inspect immediately',
      topSourceFreshness: 'just now',
      topSourceTimestamp: '2026-03-26 18:59',
      topSourceTrend: { last15m: 3, last60m: 6, label: 'Hot' },
    });
    const sourcesText = buildVisibleSourcesText(context, {
      sources: [source],
      sharePercent: 67,
      concentrationPercent: 80,
      mode: { label: 'Focused', hint: 'Mostly one source' },
    });

    expect(latestText).toContain('Top source trend: Hot | 15m=3 | 60m=6');
    expect(digestText).toContain('Latest timestamp: Unknown');
    expect(digestText).toContain('Mode hint: Mostly one source');
    expect(sourcesText).toContain('4x | proxy | ERROR | Proxy failed');
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

  it('builds recent issue digest snapshots and no-state visible slice summaries', () => {
    const recentIssueDigest = buildRecentIssueDigestText(context, {
      recentIssueCount: 7,
      recentIssueBreakdown: { error: 5, warn: 2 },
      latestRecentIssue: createEntry(),
    });
    const emptyVisibleSlice = buildVisibleSliceSummaryText(context, {
      totalEntries: 0,
      visibleEntries: 0,
      filteredCounts: { debug: 0, info: 0, warn: 0, error: 0 },
      visibleTrendLabel: 'Cold',
      filter: 'all',
      recentWindowOnly: false,
      sortOrder: 'oldest',
      query: '   ',
      visibleIssueTrend: { last15m: 0, last60m: 0 },
      latestVisibleIssue: null,
    });

    expect(recentIssueDigest).toContain('Incidents 60m: 7');
    expect(recentIssueDigest).toContain('Latest recent issue: error:Proxy failed');
    expect(emptyVisibleSlice).toContain('Recent only: No');
    expect(emptyVisibleSlice).toContain('Search: None');
  });
});
