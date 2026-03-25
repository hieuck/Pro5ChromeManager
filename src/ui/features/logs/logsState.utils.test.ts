import { describe, expect, it } from 'vitest';
import type { ParsedLogEntry } from './logParsing';
import {
  buildRepeatedRecentIssues,
  buildRepeatedRecentSources,
  buildSourceOptions,
  buildVisibleSources,
  calculateIssueStreak,
  calculateVisibleIssueTrend,
  countLogLevels,
  countRecentIssues,
  filterIssueEntries,
  filterLogEntries,
  findLatestIssue,
  getDefaultLogsViewState,
  getRecentIssueBreakdown,
  parseStoredLogsViewState,
  sortLogEntries,
} from './logsState.utils';

const NOW = new Date('2026-03-26T12:00:00.000Z').getTime();

function createEntry(overrides: Partial<ParsedLogEntry>): ParsedLogEntry {
  return {
    timestamp: '2026-03-26T11:50:00.000Z',
    level: 'info',
    message: 'default',
    raw: '{"message":"default"}',
    source: 'system',
    ...overrides,
  };
}

describe('logsState utils', () => {
  const entries: ParsedLogEntry[] = [
    createEntry({
      timestamp: '2026-03-26T11:59:00.000Z',
      level: 'error',
      message: 'Proxy failed',
      raw: '{"level":"error","message":"Proxy failed"}',
      source: 'proxy',
    }),
    createEntry({
      timestamp: '2026-03-26T11:58:00.000Z',
      level: 'warn',
      message: 'Proxy failed',
      raw: '{"level":"warn","message":"Proxy failed"}',
      source: 'proxy',
    }),
    createEntry({
      timestamp: '2026-03-26T11:40:00.000Z',
      level: 'warn',
      message: 'Disk nearly full',
      raw: '{"level":"warn","message":"Disk nearly full"}',
      source: 'storage',
    }),
    createEntry({
      timestamp: '2026-03-26T10:30:00.000Z',
      level: 'debug',
      message: 'Debug trace',
      raw: '{"level":"debug","message":"Debug trace"}',
      source: null,
    }),
  ];

  it('parses persisted logs view state safely', () => {
    expect(parseStoredLogsViewState(null)).toEqual(getDefaultLogsViewState());
    expect(parseStoredLogsViewState('{bad json')).toEqual(getDefaultLogsViewState());
    expect(parseStoredLogsViewState(JSON.stringify({
      filter: 'warn',
      query: 'proxy',
      sourceFilter: 'proxy',
      recentWindowOnly: true,
      sortOrder: 'oldest',
    }))).toEqual({
      filter: 'warn',
      query: 'proxy',
      sourceFilter: 'proxy',
      recentWindowOnly: true,
      sortOrder: 'oldest',
    });
  });

  it('filters and sorts log entries from the active view state', () => {
    const matched = filterLogEntries(entries, {
      filter: 'issues',
      query: 'proxy',
      sourceFilter: 'proxy',
      recentWindowOnly: true,
    }, NOW);

    expect(matched).toHaveLength(2);
    expect(sortLogEntries(matched, 'oldest').map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  it('builds log insights for counts, issues, and sources', () => {
    expect(countLogLevels(entries)).toEqual({ debug: 1, info: 0, warn: 2, error: 1 });
    expect(findLatestIssue(entries)?.message).toBe('Proxy failed');
    expect(calculateIssueStreak(entries)).toBe(3);
    expect(filterIssueEntries(entries)).toHaveLength(3);
    expect(countRecentIssues(entries, 60, NOW)).toBe(3);
    expect(getRecentIssueBreakdown(entries, NOW)).toEqual({ error: 1, warn: 2 });
    expect(calculateVisibleIssueTrend(entries, NOW)).toEqual({ last15m: 2, last60m: 3 });
    expect(buildSourceOptions(entries)).toEqual([
      { label: 'proxy', value: 'proxy' },
      { label: 'storage', value: 'storage' },
      { label: 'unknown', value: 'unknown' },
    ]);

    const visibleSources = buildVisibleSources(entries);
    expect(visibleSources[0]).toMatchObject({ source: 'proxy', count: 2 });
    expect(visibleSources[0]?.latestEntry.timestamp).toBe('2026-03-26T11:59:00.000Z');
  });

  it('summarizes repeated recent issues and sources with highest severity', () => {
    expect(buildRepeatedRecentIssues(filterIssueEntries(entries))).toEqual([
      { count: 2, level: 'error', message: 'Proxy failed' },
    ]);

    expect(buildRepeatedRecentSources(filterIssueEntries(entries))).toEqual([
      expect.objectContaining({ count: 2, level: 'error', source: 'proxy' }),
      expect.objectContaining({ count: 1, level: 'warn', source: 'storage' }),
    ]);
  });
});
