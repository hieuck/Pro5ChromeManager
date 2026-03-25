import type { ParsedLogEntry } from './logParsing';

export type LogsFilter = 'all' | 'issues' | 'debug' | 'info' | 'warn' | 'error';
export type LogsSortOrder = 'newest' | 'oldest';

export interface StoredLogsViewState {
  filter: LogsFilter;
  query: string;
  sourceFilter: string;
  recentWindowOnly: boolean;
  sortOrder: LogsSortOrder;
}

export interface LogLevelCounts {
  debug: number;
  info: number;
  warn: number;
  error: number;
}

export interface SourceOption {
  label: string;
  value: string;
}

export interface VisibleSourceSummary {
  count: number;
  source: string;
  latestEntry: ParsedLogEntry;
}

export interface RepeatedRecentIssueSummary {
  count: number;
  level: 'warn' | 'error';
  message: string;
}

export interface RepeatedRecentSourceSummary {
  count: number;
  level: 'warn' | 'error';
  source: string;
  latestEntry: ParsedLogEntry;
}

const DEFAULT_LOGS_VIEW_STATE: StoredLogsViewState = {
  filter: 'all',
  query: '',
  sourceFilter: '',
  recentWindowOnly: false,
  sortOrder: 'newest',
};

function isLogIssue(entry: ParsedLogEntry): boolean {
  return entry.level === 'warn' || entry.level === 'error';
}

export function getDefaultLogsViewState(): StoredLogsViewState {
  return { ...DEFAULT_LOGS_VIEW_STATE };
}

export function parseStoredLogsViewState(rawValue: string | null): StoredLogsViewState {
  if (!rawValue) {
    return getDefaultLogsViewState();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredLogsViewState>;
    return {
      filter: (['issues', 'debug', 'info', 'warn', 'error'] as const).includes(parsed.filter as LogsFilter)
        ? (parsed.filter as LogsFilter)
        : 'all',
      query: typeof parsed.query === 'string' ? parsed.query : '',
      sourceFilter: typeof parsed.sourceFilter === 'string' ? parsed.sourceFilter : '',
      recentWindowOnly: Boolean(parsed.recentWindowOnly),
      sortOrder: parsed.sortOrder === 'oldest' ? 'oldest' : 'newest',
    };
  } catch {
    return getDefaultLogsViewState();
  }
}

export function isWithinLastMinutes(
  value: string | null,
  minutes: number,
  now = Date.now(),
): boolean {
  if (!value) {
    return false;
  }

  const diffMs = now - new Date(value).getTime();
  return diffMs >= 0 && diffMs <= minutes * 60_000;
}

export function filterLogEntries(
  entries: ParsedLogEntry[],
  viewState: Pick<StoredLogsViewState, 'filter' | 'query' | 'sourceFilter' | 'recentWindowOnly'>,
  now = Date.now(),
): ParsedLogEntry[] {
  const normalizedQuery = viewState.query.trim().toLowerCase();

  return entries.filter((entry) => {
    const levelMatches = viewState.filter === 'all'
      || (viewState.filter === 'issues' ? isLogIssue(entry) : entry.level === viewState.filter);
    const windowMatches = !viewState.recentWindowOnly || isWithinLastMinutes(entry.timestamp, 60, now);
    const queryMatches = !normalizedQuery || entry.raw.toLowerCase().includes(normalizedQuery);
    const effectiveSource = entry.source ?? 'unknown';
    const sourceMatches = !viewState.sourceFilter || effectiveSource === viewState.sourceFilter;

    return levelMatches && windowMatches && queryMatches && sourceMatches;
  });
}

export function sortLogEntries(entries: ParsedLogEntry[], sortOrder: LogsSortOrder): ParsedLogEntry[] {
  return sortOrder === 'oldest' ? entries.slice().reverse() : entries;
}

export function buildSourceOptions(entries: ParsedLogEntry[]): SourceOption[] {
  return Array.from(new Set(entries.map((entry) => entry.source ?? 'unknown')))
    .sort((left, right) => left.localeCompare(right))
    .map((source) => ({ label: source, value: source }));
}

export function countLogLevels(entries: ParsedLogEntry[]): LogLevelCounts {
  return entries.reduce<LogLevelCounts>((accumulator, entry) => {
    accumulator[entry.level] += 1;
    return accumulator;
  }, { debug: 0, info: 0, warn: 0, error: 0 });
}

export function findLatestIssue(entries: ParsedLogEntry[]): ParsedLogEntry | null {
  return entries.find(isLogIssue) ?? null;
}

export function calculateIssueStreak(entries: ParsedLogEntry[]): number {
  let streak = 0;

  for (const entry of entries) {
    if (isLogIssue(entry)) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

export function filterIssueEntries(entries: ParsedLogEntry[]): ParsedLogEntry[] {
  return entries.filter(isLogIssue);
}

export function countRecentIssues(entries: ParsedLogEntry[], minutes: number, now = Date.now()): number {
  return entries.filter((entry) => isLogIssue(entry) && isWithinLastMinutes(entry.timestamp, minutes, now)).length;
}

export function getRecentIssueBreakdown(entries: ParsedLogEntry[], now = Date.now()): { error: number; warn: number } {
  return {
    error: entries.filter((entry) => entry.level === 'error' && isWithinLastMinutes(entry.timestamp, 60, now)).length,
    warn: entries.filter((entry) => entry.level === 'warn' && isWithinLastMinutes(entry.timestamp, 60, now)).length,
  };
}

export function calculateVisibleIssueTrend(
  entries: ParsedLogEntry[],
  now = Date.now(),
): { last15m: number; last60m: number } {
  return {
    last15m: entries.filter((entry) => isLogIssue(entry) && isWithinLastMinutes(entry.timestamp, 15, now)).length,
    last60m: entries.filter((entry) => isLogIssue(entry) && isWithinLastMinutes(entry.timestamp, 60, now)).length,
  };
}

export function buildVisibleSources(
  entries: ParsedLogEntry[],
  limit = 3,
): VisibleSourceSummary[] {
  const countsBySource = new Map<string, VisibleSourceSummary>();

  for (const entry of entries) {
    const sourceKey = entry.source ?? 'unknown';
    const current = countsBySource.get(sourceKey);

    if (current) {
      current.count += 1;
      if ((entry.timestamp ?? '') > (current.latestEntry.timestamp ?? '')) {
        current.latestEntry = entry;
      }
      continue;
    }

    countsBySource.set(sourceKey, { count: 1, source: sourceKey, latestEntry: entry });
  }

  return Array.from(countsBySource.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export function buildRepeatedRecentIssues(
  entries: ParsedLogEntry[],
  limit = 3,
): RepeatedRecentIssueSummary[] {
  const countsByMessage = new Map<string, RepeatedRecentIssueSummary>();

  for (const entry of entries) {
    const current = countsByMessage.get(entry.message);

    if (current) {
      current.count += 1;
      if (entry.level === 'error') {
        current.level = 'error';
      }
      continue;
    }

    countsByMessage.set(entry.message, {
      count: 1,
      level: entry.level as 'warn' | 'error',
      message: entry.message,
    });
  }

  return Array.from(countsByMessage.values())
    .filter((entry) => entry.count > 1)
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export function buildRepeatedRecentSources(
  entries: ParsedLogEntry[],
  limit = 3,
): RepeatedRecentSourceSummary[] {
  const countsBySource = new Map<string, RepeatedRecentSourceSummary>();

  for (const entry of entries) {
    if (!entry.source) {
      continue;
    }

    const current = countsBySource.get(entry.source);

    if (current) {
      current.count += 1;
      if (entry.level === 'error') {
        current.level = 'error';
      }
      if ((entry.timestamp ?? '') > (current.latestEntry.timestamp ?? '')) {
        current.latestEntry = entry;
      }
      continue;
    }

    countsBySource.set(entry.source, {
      count: 1,
      level: entry.level as 'warn' | 'error',
      source: entry.source,
      latestEntry: entry,
    });
  }

  return Array.from(countsBySource.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}
