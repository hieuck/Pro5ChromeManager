import { describe, expect, it } from 'vitest';
import {
  buildActivityDigestText,
  buildHottestIssueDigestText,
  buildLatestActivityDigestText,
  buildTopActivityIssuesText,
  buildTopActivitySourceLatestText,
  buildTopActivitySourcesText,
  type DashboardActivityCopyContext,
} from './dashboardActivityCopyText';
import type { LogEntry } from './types';

function createEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: '2026-03-26T11:59:00.000Z',
    level: 'error',
    message: 'Proxy failed',
    raw: '{"message":"Proxy failed"}',
    source: 'proxy',
    ...overrides,
  };
}

const context: DashboardActivityCopyContext = {
  labels: {
    logHeatLabel: 'Heat',
    hottestIssueDigestTitle: 'Hottest issue',
    hottestIssueRepeatsDigestLabel: 'Repeats',
    levelLabel: 'Level',
    timestampLabel: 'Timestamp',
    messageLabel: 'Message',
    rawLabel: 'Raw',
    activityDigestTitle: 'Activity digest',
    activityEntriesDigestLabel: 'Entries',
    activityIssues15Label: 'Issues 15m',
    activityIssues60Label: 'Issues 60m',
    errorCountLabel: 'Errors',
    warningCountLabel: 'Warnings',
    debugCountLabel: 'Debug',
    infoCountLabel: 'Info',
    issueRatioLabel: 'Issue ratio',
    activitySignalModeLabel: 'Signal mode',
    activitySignalHintLabel: 'Signal hint',
    activityFreshnessLabel: 'Freshness',
    latestActivityLevelLabel: 'Latest activity level',
    topActivitySourceDigestLabel: 'Top source',
    topActivitySourceLatestDigestLabel: 'Top source latest',
    topActivitySourceFreshnessDigestLabel: 'Top source freshness',
    topActivitySourceLatestLevelDigestLabel: 'Top source latest level',
    topActivitySourceLatestMessageDigestLabel: 'Top source latest message',
    topActivitySourceShareLabel: 'Top source share',
    topActivitySourcesConcentrationLabel: 'Top source concentration',
    activitySourceModeLabel: 'Source mode',
    activitySourceModeHintLabel: 'Source mode hint',
    hottestIssueFreshnessLabel: 'Hottest freshness',
    hottestIssueLevelLabel: 'Hottest level',
    latestActivityDigestLabel: 'Latest activity',
    latestMessageLabel: 'Latest message',
    latestSourceDigestLabel: 'Latest source',
    topIssuesDigestLabel: 'Top issues',
    topActivitySourcesDigestLabel: 'Top sources',
    latestActivityDigestTitle: 'Latest activity digest',
    topActivityIssuesDigestTitle: 'Top activity issues',
    topActivitySourceLatestDigestTitle: 'Top activity source latest',
    sourceLabel: 'Source',
    countLabel: 'Count',
    freshnessLabel: 'Freshness label',
    levelTextLabel: 'Level text',
    topActivitySourcesDigestTitle: 'Top activity sources',
  },
  formatters: {
    formatActivitySummary: (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
    formatTimestamp: (value) => value,
    getLogLevelLabel: (level) => level.toUpperCase(),
  },
};

describe('dashboardActivityCopyText', () => {
  it('builds hottest issue digest text', () => {
    const text = buildHottestIssueDigestText(context, {
      logHeatLabel: 'Hot',
      count: 4,
      entry: createEntry(),
    });

    expect(text).toContain('Heat: Hot');
    expect(text).toContain('Repeats: 4');
    expect(text).toContain('Level: ERROR');
  });

  it('builds activity digest text with source and issue summaries', () => {
    const latestEntry = createEntry();
    const text = buildActivityDigestText(context, {
      logHeatLabel: 'Elevated',
      total: 12,
      issues15: 2,
      issues60: 5,
      errors: 3,
      warnings: 2,
      debugs: 4,
      infos: 3,
      issueRatio: 42,
      activitySignalMode: { label: 'Mixed', hint: 'Inspect sources' },
      activityFreshness: { label: 'Warm' },
      latestActivityLevel: { label: 'Error' },
      topSource: ['proxy', 6],
      topSourceLatestEntry: latestEntry,
      topSourceLatestFreshness: { label: 'Fresh' },
      topSourceLatestLevel: { label: 'Critical' },
      topSourceShare: 50,
      topSourcesConcentration: 75,
      activitySourceMode: { label: 'Focused', hint: 'One source dominates' },
      hottestRecentIssue: { count: 3 },
      hottestIssueFreshness: { label: 'Fresh' },
      hottestIssueLevel: { label: 'Error' },
      latestEntry,
      topRecentIssues: [{ entry: latestEntry, count: 3 }],
      topSources: [['proxy', 6], ['storage', 2]],
    });

    expect(text).toContain('Entries: 12');
    expect(text).toContain('Top source: proxy (6)');
    expect(text).toContain('Top issues: Proxy failed (3)');
    expect(text).toContain('Top sources: proxy (6), storage (2)');
  });

  it('omits optional activity digest sections when source and issue details are unavailable', () => {
    const latestEntry = createEntry({ source: undefined });
    const text = buildActivityDigestText(context, {
      logHeatLabel: 'Calm',
      total: 3,
      issues15: 0,
      issues60: 0,
      errors: 0,
      warnings: 0,
      debugs: 1,
      infos: 2,
      issueRatio: 0,
      activitySignalMode: { label: 'Quiet', hint: 'No issues' },
      activityFreshness: { label: 'Stale' },
      latestActivityLevel: { label: 'Info' },
      topSource: null,
      topSourceLatestEntry: null,
      topSourceLatestFreshness: { label: 'Fresh' },
      topSourceLatestLevel: { label: 'Info' },
      topSourceShare: 0,
      topSourcesConcentration: 0,
      activitySourceMode: { label: 'Distributed', hint: 'Spread out' },
      hottestRecentIssue: null,
      hottestIssueFreshness: { label: 'Fresh' },
      hottestIssueLevel: { label: 'Warn' },
      latestEntry,
      topRecentIssues: [],
      topSources: [],
    });

    expect(text).toContain('Top source share: 0%');
    expect(text).not.toContain('Top source:');
    expect(text).not.toContain('Top issues:');
    expect(text).not.toContain('Latest source:');
    expect(text).not.toContain('Hottest freshness:');
  });

  it('builds latest activity digest text', () => {
    const text = buildLatestActivityDigestText(context, createEntry());

    expect(text).toContain('Latest activity digest');
    expect(text).toContain('Timestamp: 2026-03-26T11:59:00.000Z');
    expect(text).toContain('Raw: {"message":"Proxy failed"}');
  });

  it('builds top activity issues text', () => {
    const text = buildTopActivityIssuesText(context, 'Hot', [
      { entry: createEntry({ message: 'Proxy failed' }), count: 4 },
      { entry: createEntry({ message: 'Runtime stalled' }), count: 2 },
    ]);

    expect(text).toContain('Top activity issues');
    expect(text).toContain('Heat: Hot');
    expect(text).toContain('1. Proxy failed (4)');
    expect(text).toContain('2. Runtime stalled (2)');
  });

  it('builds top activity source latest text', () => {
    const text = buildTopActivitySourceLatestText(context, {
      source: ['proxy', 6],
      entry: createEntry(),
      freshnessLabel: 'Fresh',
      levelText: 'Critical',
    });

    expect(text).toContain('Source: proxy');
    expect(text).toContain('Count: 6');
    expect(text).toContain('Level text: Critical');
  });

  it('builds top activity sources text', () => {
    const text = buildTopActivitySourcesText(context, {
      modeLabel: 'Focused',
      topSourceShare: 60,
      topSourcesConcentration: 85,
      topSources: [['proxy', 6], ['runtime', 3], ['support', 1]],
    });

    expect(text).toContain('Top activity sources');
    expect(text).toContain('Source mode: Focused');
    expect(text).toContain('Top source share: 60%');
    expect(text).toContain('Top source concentration: 85%');
    expect(text).toContain('1. proxy (6)');
    expect(text).toContain('3. support (1)');
  });
});
