import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useTranslation } from '../../hooks/useTranslation';
import { type ParsedLogEntry } from '../../utils/logParsing';

const LOGS_VIEW_STORAGE_KEY = 'pro5.logs.view';

export interface StoredLogsViewState {
  filter: 'all' | 'issues' | 'debug' | 'info' | 'warn' | 'error';
  query: string;
  sourceFilter: string;
  recentWindowOnly: boolean;
  sortOrder: 'newest' | 'oldest';
}

export interface LogsRouteState {
  presetQuery?: string;
  presetFilter?: 'all' | 'issues' | 'debug' | 'info' | 'warn' | 'error';
  presetSourceFilter?: string;
  presetRecentWindowOnly?: boolean;
  presetSortOrder?: 'newest' | 'oldest';
}

export interface LogsState {
  t: ReturnType<typeof useTranslation>['t'];
  entries: ParsedLogEntry[];
  loading: boolean;
  filter: 'all' | 'issues' | 'debug' | 'info' | 'warn' | 'error';
  query: string;
  sourceFilter: string;
  autoRefresh: boolean;
  recentWindowOnly: boolean;
  sortOrder: 'newest' | 'oldest';
  lastRefreshedAt: string | null;
  
  // Setters
  setFilter: (v: 'all' | 'issues' | 'debug' | 'info' | 'warn' | 'error') => void;
  setQuery: (v: string) => void;
  setSourceFilter: (v: string) => void;
  setAutoRefresh: (v: boolean) => void;
  setRecentWindowOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSortOrder: (v: 'newest' | 'oldest') => void;
  
  // Derived
  filteredEntries: ParsedLogEntry[];
  matchedEntries: ParsedLogEntry[];
  sourceOptions: { label: string; value: string }[];
  counts: { debug: number; info: number; warn: number; error: number };
  filteredCounts: { debug: number; info: number; warn: number; error: number };
  visibleIssueRatio: number;
  latestIssue: ParsedLogEntry | null;
  latestVisibleIssue: ParsedLogEntry | null;
  issueStreak: number;
  recentIssueCount: number;
  recentIssueEntries: ParsedLogEntry[];
  recentIssueBreakdown: { error: number; warn: number };
  visibleIssueTrend: { last15m: number; last60m: number };
  visibleTrendStatus: { tone: 'info' | 'warning' | 'error'; label: string };
  visibleSources: Array<{ count: number; source: string; latestEntry: ParsedLogEntry }>;
  visibleTopSource: { count: number; source: string; latestEntry: ParsedLogEntry } | null;
  visibleTopSourceShare: number;
  visibleTopSourceFreshness: string;
  visibleTopSourceTimestamp: string;
  visibleTopSourceTrend: { last15m: number; last60m: number; label: string };
  visibleTopSourcesConcentration: number;
  visibleSourceMode: { label: string; hint: string };
  visibleSourceActionHint: string;
  visibleSourceActionButtonLabel: string;
  repeatedRecentIssues: Array<{ count: number; level: 'warn' | 'error'; message: string }>;
  repeatedRecentIssue: { count: number; level: 'warn' | 'error'; message: string } | null;
  repeatedRecentSources: Array<{ count: number; level: 'warn' | 'error'; source: string; latestEntry: ParsedLogEntry }>;
  hottestRecentSource: { count: number; level: 'warn' | 'error'; source: string; latestEntry: ParsedLogEntry } | null;
  activeFilterTags: Array<{ key: string; label: string; onClose: () => void }>;
  
  // Handlers
  loadLogs: () => Promise<void>;
  handleCopySingleLog: (raw: string) => Promise<void>;
  handleCopyVisibleLogs: () => Promise<void>;
  handleCopyIssues: () => Promise<void>;
  handleCopyIssueDigest: () => Promise<void>;
  handleCopyRecentIssueDigest: () => Promise<void>;
  handleCopyLatestIssue: () => Promise<void>;
  handleFocusLatestIssue: () => void;
  handleFocusVisibleIssue: () => void;
  handleCopyVisibleIssue: () => Promise<void>;
  handleCopyVisibleSliceSummary: () => Promise<void>;
  handleFocusRepeatedRecentIssue: (msg: string) => void;
  handleFocusRecentIssueSource: (src: string) => void;
  handleOpenRecentIssueSourceLatest: (entry: ParsedLogEntry | null | undefined) => void;
  handleCopyRecentIssueSourceLatest: (source: string, entry: ParsedLogEntry | null | undefined) => Promise<void>;
  handleCopyRepeatedRecentIssues: () => Promise<void>;
  handleCopyRecentIssueSources: () => Promise<void>;
  handleFocusVisibleSource: (src: string) => void;
  handleOpenVisibleSourceLatest: (entry: ParsedLogEntry | null | undefined) => void;
  handleCopyVisibleSourceLatest: (source: any) => Promise<void>;
  handleCopyVisibleTopSourceSummary: () => Promise<void>;
  handleCopyVisibleSourceDigest: (source: any) => Promise<void>;
  handleCopyVisibleSources: () => Promise<void>;
  handleCopyRecentIssueSourceDigest: (source: any) => Promise<void>;
  handleRunSelfTest: () => Promise<void>;
  handleExportVisibleLogs: () => void;
  handleResetFilters: () => void;
  handleResetViewState: () => void;
  handleRecentIssuesPreset: () => void;
  
  // Helpers
  highlightSearchMatch: (v: string) => React.ReactNode;
  formatTimestamp: (v: string | null) => string;
  formatRelativeTime: (v: string | null) => string;
  getLogLevelLabel: (v: any) => string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWithinLastMinutes(value: string | null, minutes: number): boolean {
  if (!value) return false;
  const diffMs = Date.now() - new Date(value).getTime();
  return diffMs >= 0 && diffMs <= minutes * 60_000;
}

export const useLogsState = (): LogsState => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const initialViewState = useMemo<StoredLogsViewState>(() => {
    if (typeof window === 'undefined') {
      return { filter: 'all', query: '', sourceFilter: '', recentWindowOnly: false, sortOrder: 'newest' };
    }
    try {
      const rawValue = window.localStorage.getItem(LOGS_VIEW_STORAGE_KEY);
      if (!rawValue) return { filter: 'all', query: '', sourceFilter: '', recentWindowOnly: false, sortOrder: 'newest' };
      const parsed = JSON.parse(rawValue) as Partial<StoredLogsViewState>;
      return {
        filter: (['issues', 'debug', 'info', 'warn', 'error'] as const).includes(parsed.filter as any) ? (parsed.filter as any) : 'all',
        query: typeof parsed.query === 'string' ? parsed.query : '',
        sourceFilter: typeof parsed.sourceFilter === 'string' ? parsed.sourceFilter : '',
        recentWindowOnly: Boolean(parsed.recentWindowOnly),
        sortOrder: parsed.sortOrder === 'oldest' ? 'oldest' : 'newest',
      };
    } catch {
      return { filter: 'all', query: '', sourceFilter: '', recentWindowOnly: false, sortOrder: 'newest' };
    }
  }, []);

  const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'issues' | 'debug' | 'info' | 'warn' | 'error'>(initialViewState.filter);
  const [query, setQuery] = useState(initialViewState.query);
  const [sourceFilter, setSourceFilter] = useState(initialViewState.sourceFilter);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [recentWindowOnly, setRecentWindowOnly] = useState(initialViewState.recentWindowOnly);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>(initialViewState.sortOrder);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const formatTimestamp = useCallback((value: string | null): string => {
    if (!value) return '—';
    return new Date(value).toLocaleString('vi-VN');
  }, []);

  const formatRelativeTime = useCallback((value: string | null): string => {
    if (!value) return '—';
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));
    if (diffMinutes < 1) return t.logs.justNow;
    if (diffMinutes < 60) return t.logs.minutesAgo.replace('{count}', String(diffMinutes));
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return t.logs.hoursAgo.replace('{count}', String(diffHours));
    const diffDays = Math.round(diffHours / 24);
    return t.logs.daysAgo.replace('{count}', String(diffDays));
  }, [t.logs]);

  const highlightSearchMatch = useCallback((value: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return value;
    const parts = value.split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'gi'));
    return parts.map((part, index) => (
      part.toLowerCase() === normalizedQuery.toLowerCase()
        ? <mark key={`${part}-${index}`}>{part}</mark>
        : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ));
  }, [query]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<ParsedLogEntry[]>('/api/logs');
    setLoading(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    setEntries(res.data.slice().reverse());
    setLastRefreshedAt(new Date().toISOString());
  }, []);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = window.setInterval(() => { void loadLogs(); }, 10_000);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh, loadLogs]);

  useEffect(() => {
    const routeState = location.state as LogsRouteState | null;
    if (!routeState) return;
    if (routeState.presetQuery !== undefined) setQuery(routeState.presetQuery);
    if (routeState.presetFilter !== undefined) setFilter(routeState.presetFilter);
    if (routeState.presetSourceFilter !== undefined) setSourceFilter(routeState.presetSourceFilter);
    if (routeState.presetRecentWindowOnly !== undefined) setRecentWindowOnly(routeState.presetRecentWindowOnly);
    if (routeState.presetSortOrder !== undefined) setSortOrder(routeState.presetSortOrder);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextState: StoredLogsViewState = { filter, query, sourceFilter, recentWindowOnly, sortOrder };
    window.localStorage.setItem(LOGS_VIEW_STORAGE_KEY, JSON.stringify(nextState));
  }, [filter, query, recentWindowOnly, sortOrder, sourceFilter]);

  const matchedEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const levelMatches = filter === 'all'
        || (filter === 'issues' ? entry.level === 'warn' || entry.level === 'error' : entry.level === filter);
      const windowMatches = !recentWindowOnly || isWithinLastMinutes(entry.timestamp, 60);
      const queryMatches = !normalizedQuery || entry.raw.toLowerCase().includes(normalizedQuery);
      const effectiveSource = entry.source ?? 'unknown';
      const sourceMatches = !sourceFilter || effectiveSource === sourceFilter;
      return levelMatches && windowMatches && queryMatches && sourceMatches;
    });
  }, [entries, filter, query, recentWindowOnly, sourceFilter]);

  const filteredEntries = useMemo(
    () => (sortOrder === 'oldest' ? matchedEntries.slice().reverse() : matchedEntries),
    [matchedEntries, sortOrder],
  );

  const sourceOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.source ?? 'unknown')))
      .sort((left, right) => left.localeCompare(right))
      .map((source) => ({ label: source, value: source })),
    [entries],
  );

  const counts = useMemo(() => ({
    debug: entries.filter((entry) => entry.level === 'debug').length,
    info: entries.filter((entry) => entry.level === 'info').length,
    warn: entries.filter((entry) => entry.level === 'warn').length,
    error: entries.filter((entry) => entry.level === 'error').length,
  }), [entries]);

  const filteredCounts = useMemo(() => ({
    debug: filteredEntries.filter((entry) => entry.level === 'debug').length,
    info: filteredEntries.filter((entry) => entry.level === 'info').length,
    warn: filteredEntries.filter((entry) => entry.level === 'warn').length,
    error: filteredEntries.filter((entry) => entry.level === 'error').length,
  }), [filteredEntries]);

  const visibleIssueRatio = useMemo(() => {
    if (!filteredEntries.length) return 0;
    return Math.round(((filteredCounts.error + filteredCounts.warn) / filteredEntries.length) * 100);
  }, [filteredCounts.error, filteredCounts.warn, filteredEntries.length]);

  const latestIssue = useMemo(
    () => entries.find((entry) => entry.level === 'warn' || entry.level === 'error') ?? null,
    [entries],
  );

  const latestVisibleIssue = useMemo(
    () => matchedEntries.find((entry) => entry.level === 'warn' || entry.level === 'error') ?? null,
    [matchedEntries],
  );

  const getLogLevelLabel = useCallback((level: ParsedLogEntry['level'] | 'all' | 'issues') => {
    switch (level) {
      case 'debug': return t.logs.filterDebug;
      case 'info': return t.logs.filterInfo;
      case 'warn': return t.logs.filterWarn;
      case 'error': return t.logs.filterError;
      case 'issues': return t.logs.issuesOnly;
      case 'all': default: return t.logs.filterAll;
    }
  }, [t.logs]);

  const getSortOrderLabel = useCallback((order: 'newest' | 'oldest') => (
    order === 'oldest' ? t.logs.sortOldest : t.logs.sortNewest
  ), [t.logs]);

  const formatMaybeValue = useCallback((value: string | null | undefined, fallback = t.settings.noneValue) => (
    value && value.trim() ? value : fallback
  ), [t.settings.noneValue]);

  const formatIssueSummary = useCallback((entry: ParsedLogEntry | null | undefined, emptyLabel = t.settings.noneValue) => (
    entry
      ? `${getLogLevelLabel(entry.level)} | ${formatMaybeValue(entry.timestamp, t.logs.unknownValue)} | ${entry.message}`
      : emptyLabel
  ), [formatMaybeValue, getLogLevelLabel, t.logs.unknownValue, t.settings.noneValue]);

  const issueStreak = useMemo(() => {
    let streak = 0;
    for (const entry of entries) {
      if (entry.level === 'warn' || entry.level === 'error') { streak += 1; continue; }
      break;
    }
    return streak;
  }, [entries]);

  const handleCopySingleLog = useCallback(async (raw: string) => {
    try {
      await navigator.clipboard.writeText(raw);
      void message.success(t.logs.copied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [t.logs]);

  const handleCopyVisibleLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filteredEntries.map((entry) => entry.raw).join('\n'));
      void message.success(t.logs.copied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [filteredEntries, t.logs]);

  const issueEntries = useMemo(
    () => matchedEntries.filter((entry) => entry.level === 'warn' || entry.level === 'error'),
    [matchedEntries],
  );

  const recentIssueCount = useMemo(
    () => entries.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 60)).length,
    [entries],
  );

  const recentIssueBreakdown = useMemo(() => ({
    error: entries.filter((entry) => entry.level === 'error' && isWithinLastMinutes(entry.timestamp, 60)).length,
    warn: entries.filter((entry) => entry.level === 'warn' && isWithinLastMinutes(entry.timestamp, 60)).length,
  }), [entries]);

  const recentIssueEntries = useMemo(
    () => entries.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 60)),
    [entries],
  );

  const visibleIssueTrend = useMemo(() => ({
    last15m: matchedEntries.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 15)).length,
    last60m: matchedEntries.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 60)).length,
  }), [matchedEntries]);

  const visibleTrendStatus = useMemo(() => {
    if (visibleIssueTrend.last15m >= 3) return { tone: 'error' as const, label: t.logs.visibleTrendHot };
    if (visibleIssueTrend.last15m > 0 || visibleIssueTrend.last60m >= 5) return { tone: 'warning' as const, label: t.logs.visibleTrendElevated };
    return { tone: 'info' as const, label: t.logs.visibleTrendCalm };
  }, [t.logs, visibleIssueTrend]);

  const visibleSources = useMemo(() => {
    const countsBySource = new Map<string, { count: number; source: string; latestEntry: ParsedLogEntry }>();
    for (const entry of matchedEntries) {
      const sourceKey = entry.source ?? 'unknown';
      const current = countsBySource.get(sourceKey);
      if (current) {
        current.count += 1;
        if ((entry.timestamp ?? '') > (current.latestEntry.timestamp ?? '')) current.latestEntry = entry;
        continue;
      }
      countsBySource.set(sourceKey, { count: 1, source: sourceKey, latestEntry: entry });
    }
    return Array.from(countsBySource.values()).sort((left, right) => right.count - left.count).slice(0, 3);
  }, [matchedEntries]);

  const visibleTopSource = visibleSources[0] ?? null;

  const visibleTopSourceShare = useMemo(() => {
    if (!visibleTopSource || !matchedEntries.length) return 0;
    return Math.round((visibleTopSource.count / matchedEntries.length) * 100);
  }, [matchedEntries.length, visibleTopSource]);

  const visibleTopSourceFreshness = useMemo(() => {
    if (!visibleTopSource?.latestEntry.timestamp) return '—';
    return formatRelativeTime(visibleTopSource.latestEntry.timestamp);
  }, [formatRelativeTime, visibleTopSource?.latestEntry.timestamp]);

  const visibleTopSourceTimestamp = useMemo(
    () => formatTimestamp(visibleTopSource?.latestEntry.timestamp ?? null),
    [formatTimestamp, visibleTopSource?.latestEntry.timestamp],
  );

  const visibleTopSourceTrend = useMemo(() => {
    if (!visibleTopSource) return { last15m: 0, last60m: 0, label: '' };
    const sourceEntries = matchedEntries.filter((entry) => entry.source === visibleTopSource.source);
    const last15m = sourceEntries.filter((entry) => isWithinLastMinutes(entry.timestamp, 15)).length;
    const last60m = sourceEntries.filter((entry) => isWithinLastMinutes(entry.timestamp, 60)).length;
    if (last15m >= 3) return { last15m, last60m, label: t.logs.visibleTrendHot };
    if (last15m > 0 || last60m >= 5) return { last15m, last60m, label: t.logs.visibleTrendElevated };
    return { last15m, last60m, label: t.logs.visibleTrendCalm };
  }, [matchedEntries, t.logs, visibleTopSource]);

  const visibleTopSourcesConcentration = useMemo(() => {
    if (!matchedEntries.length) return 0;
    const visibleTopCount = visibleSources.reduce((sum, s) => sum + s.count, 0);
    return Math.round((visibleTopCount / matchedEntries.length) * 100);
  }, [matchedEntries.length, visibleSources]);

  const visibleSourceMode = useMemo(() => {
    if (visibleTopSourceShare >= 60 || visibleTopSourcesConcentration >= 85) return { label: t.logs.visibleSourceModeFocused, hint: t.logs.visibleSourceModeFocusedHint };
    if (visibleTopSourceShare >= 35 || visibleTopSourcesConcentration >= 65) return { label: t.logs.visibleSourceModeMixed, hint: t.logs.visibleSourceModeMixedHint };
    return { label: t.logs.visibleSourceModeDistributed, hint: t.logs.visibleSourceModeDistributedHint };
  }, [t.logs, visibleTopSourceShare, visibleTopSourcesConcentration]);

  const visibleSourceActionHint = useMemo(() => {
    if (!visibleTopSource) return '';
    if (visibleTopSource.latestEntry.level === 'error' || visibleTopSourceShare >= 60) return t.logs.visibleSourceActionFocus;
    if (visibleSourceMode.label === t.logs.visibleSourceModeMixed) return t.logs.visibleSourceActionInspect;
    return t.logs.visibleSourceActionMonitor;
  }, [t.logs, visibleSourceMode.label, visibleTopSource, visibleTopSourceShare]);

  const visibleSourceActionButtonLabel = useMemo(() => {
    if (!visibleTopSource) return '';
    if (visibleTopSource.latestEntry.level === 'error' || visibleTopSourceShare >= 60) return t.logs.visibleSourceActionButtonFocus;
    if (visibleSourceMode.label === t.logs.visibleSourceModeMixed) return t.logs.visibleSourceActionButtonInspect;
    return t.logs.visibleSourceActionButtonMonitor;
  }, [t.logs, visibleSourceMode.label, visibleTopSource, visibleTopSourceShare]);

  const repeatedRecentIssues = useMemo(() => {
    const countsByMessage = new Map<string, { count: number; level: 'warn' | 'error'; message: string }>();
    for (const entry of recentIssueEntries) {
      const current = countsByMessage.get(entry.message);
      if (current) {
        current.count += 1;
        if (entry.level === 'error') current.level = 'error';
        continue;
      }
      countsByMessage.set(entry.message, { count: 1, level: entry.level as 'warn' | 'error', message: entry.message });
    }
    return Array.from(countsByMessage.values()).filter((e) => e.count > 1).sort((a, b) => b.count - a.count).slice(0, 3);
  }, [recentIssueEntries]);

  const repeatedRecentIssue = repeatedRecentIssues[0] ?? null;

  const repeatedRecentSources = useMemo(() => {
    const countsBySource = new Map<string, { count: number; level: 'warn' | 'error'; source: string; latestEntry: ParsedLogEntry }>();
    for (const entry of recentIssueEntries) {
      if (!entry.source) continue;
      const current = countsBySource.get(entry.source);
      if (current) {
        current.count += 1;
        if (entry.level === 'error') current.level = 'error';
        if ((entry.timestamp ?? '') > (current.latestEntry.timestamp ?? '')) current.latestEntry = entry;
        continue;
      }
      countsBySource.set(entry.source, { count: 1, level: entry.level as 'warn' | 'error', source: entry.source, latestEntry: entry });
    }
    return Array.from(countsBySource.values()).sort((a, b) => b.count - a.count).slice(0, 3);
  }, [recentIssueEntries]);

  const hottestRecentSource = repeatedRecentSources[0] ?? null;

  const handleCopyIssues = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(issueEntries.map((e) => e.raw).join('\n'));
      void message.success(t.logs.issuesCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [issueEntries, t.logs]);

  const handleRunSelfTest = useCallback(async () => {
    const res = await apiClient.post('/api/support/self-test');
    if (!res.success) { void message.error(res.error); return; }
    void message.success(t.logs.selfTestRan);
  }, [t.logs]);

  const handleCopyLatestIssue = useCallback(async () => {
    if (!latestIssue) return;
    const lines = [
      `${t.logs.levelLabel}: ${getLogLevelLabel(latestIssue.level)}`,
      `${t.logs.timestampLabel}: ${formatMaybeValue(latestIssue.timestamp, t.logs.unknownValue)}`,
      `${t.logs.messageLabel}: ${latestIssue.message}`,
      `${t.logs.rawLabel}: ${latestIssue.raw}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.latestIssueCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatMaybeValue, getLogLevelLabel, latestIssue, t.logs]);

  const handleFocusLatestIssue = useCallback(() => {
    if (!latestIssue) return;
    setFilter('issues');
    setQuery(latestIssue.message);
    void message.success(t.logs.focusLatestIssueApplied);
  }, [latestIssue, t.logs]);

  const handleFocusVisibleIssue = useCallback(() => {
    if (!latestVisibleIssue) return;
    setFilter('issues');
    setQuery(latestVisibleIssue.message);
    void message.success(t.logs.focusVisibleIssueApplied);
  }, [latestVisibleIssue, t.logs]);

  const handleCopyVisibleIssue = useCallback(async () => {
    if (!latestVisibleIssue) return;
    const lines = [
      `${t.logs.levelLabel}: ${getLogLevelLabel(latestVisibleIssue.level)}`,
      `${t.logs.timestampLabel}: ${formatMaybeValue(latestVisibleIssue.timestamp, t.logs.unknownValue)}`,
      `${t.logs.messageLabel}: ${latestVisibleIssue.message}`,
      `${t.logs.rawLabel}: ${latestVisibleIssue.raw}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleIssueCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatMaybeValue, getLogLevelLabel, latestVisibleIssue, t.logs]);

  const handleCopyVisibleSliceSummary = useCallback(async () => {
    const lines = [
      t.logs.visibleLogSliceTitle,
      `${t.logs.visibleEntriesLabel}: ${filteredEntries.length}/${entries.length}`,
      `${t.logs.visibleErrorsLabel}: ${filteredCounts.error}`,
      `${t.logs.visibleWarningsLabel}: ${filteredCounts.warn}`,
      `${t.logs.visibleDebugLabel}: ${filteredCounts.debug}`,
      `${t.logs.visibleInfoLabel}: ${filteredCounts.info}`,
      `${t.logs.visibleHeatLabel}: ${visibleTrendStatus.label}`,
      `${t.logs.levelFilterLabel}: ${getLogLevelLabel(filter)}`,
      `${t.logs.recentWindowOnlyLabel}: ${recentWindowOnly ? t.common.yes : t.common.no}`,
      `${t.logs.sortOrderLabel}: ${getSortOrderLabel(sortOrder)}`,
      `${t.logs.searchLabel}: ${formatMaybeValue(query.trim())}`,
      `${t.logs.visibleIssuesLast15Label}: ${visibleIssueTrend.last15m}`,
      `${t.logs.visibleIssuesLast60Label}: ${visibleIssueTrend.last60m}`,
      `${t.logs.latestVisibleIssueLabel}: ${formatIssueSummary(latestVisibleIssue)}`,
      `${t.logs.latestVisibleSourceLabel}: ${formatMaybeValue(latestVisibleIssue?.source)}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleSliceCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [entries.length, filter, filteredCounts, filteredEntries.length, formatIssueSummary, formatMaybeValue, getLogLevelLabel, getSortOrderLabel, latestVisibleIssue, query, recentWindowOnly, sortOrder, t.common, t.logs, visibleIssueTrend, visibleTrendStatus]);

  const handleFocusRepeatedRecentIssue = useCallback((messageText: string) => {
    if (!messageText) return;
    setFilter('issues');
    setRecentWindowOnly(true);
    setQuery(messageText);
    void message.success(t.logs.focusRepeatedRecentIssueApplied);
  }, [t.logs]);

  const handleFocusRecentIssueSource = useCallback((sourceText: string) => {
    if (!sourceText) return;
    setFilter('issues');
    setRecentWindowOnly(true);
    setQuery('');
    setSourceFilter(sourceText);
    void message.success(t.logs.focusRecentIssueSourceApplied);
  }, [t.logs]);

  const handleOpenRecentIssueSourceLatest = useCallback((entry: ParsedLogEntry | null | undefined) => {
    if (!entry) return;
    setFilter('issues');
    setRecentWindowOnly(true);
    setQuery(entry.message);
    void message.success(t.logs.openRecentIssueSourceApplied);
  }, [t.logs]);

  const handleCopyRecentIssueSourceLatest = useCallback(async (source: string, entry: ParsedLogEntry | null | undefined) => {
    if (!entry) return;
    const lines = [
      t.logs.recentIssueSourceLatestTitle,
      `${t.logs.sourceLabel}: ${source}`,
      `${t.logs.levelLabel}: ${getLogLevelLabel(entry.level)}`,
      `${t.logs.timestampLabel}: ${formatMaybeValue(entry.timestamp, t.logs.unknownValue)}`,
      `${t.logs.messageLabel}: ${entry.message}`,
      `${t.logs.rawLabel}: ${entry.raw}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.recentIssueSourceLatestCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatMaybeValue, getLogLevelLabel, t.logs]);

  const handleCopyRepeatedRecentIssues = useCallback(async () => {
    const lines = ['Pro5 repeated recent issues', ...repeatedRecentIssues.map(i => `${i.level.toUpperCase()} | ${i.count}x | ${i.message}`)];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.repeatedRecentIssuesCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [repeatedRecentIssues, t.logs]);

  const handleCopyRecentIssueSources = useCallback(async () => {
    const lines = ['Pro5 repeated recent issue sources', ...repeatedRecentSources.map(s => `${s.level.toUpperCase()} | ${s.count}x | ${s.source}`)];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.recentIssueSourcesCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [repeatedRecentSources, t.logs]);

  const handleFocusVisibleSource = useCallback((sourceText: string) => {
    if (!sourceText) return;
    setSourceFilter(sourceText);
    void message.success(t.logs.focusVisibleSourceApplied);
  }, [t.logs]);

  const handleOpenVisibleSourceLatest = useCallback((entry: ParsedLogEntry | null | undefined) => {
    if (!entry) return;
    setQuery(entry.message);
    void message.success(t.logs.openVisibleSourceLatestApplied);
  }, [t.logs]);

  const handleCopyVisibleSourceLatest = useCallback(async (source: any) => {
    if (!source?.latestEntry) { void message.error(t.logs.visibleSourceLatestUnavailable); return; }
    const entry = source.latestEntry;
    const lines = [
      t.logs.visibleSourceLatestTitle,
      `${t.logs.sourceLabel}: ${source.source}`,
      `${t.logs.visibleLinesLabel}: ${source.count}`,
      `${t.logs.visibleSourceActionHintLabel}: ${visibleSourceActionHint}`,
      `${t.logs.visibleTopSourceTimestampLabel}: ${visibleTopSourceTimestamp}`,
      `${t.logs.visibleTopSourceTrendLabel}: ${visibleTopSourceTrend.label} | 15m=${visibleTopSourceTrend.last15m} | 60m=${visibleTopSourceTrend.last60m}`,
      `${t.logs.levelLabel}: ${getLogLevelLabel(entry.level)}`,
      `${t.logs.timestampLabel}: ${formatMaybeValue(entry.timestamp, t.logs.unknownValue)}`,
      `${t.logs.messageLabel}: ${entry.message}`,
      `${t.logs.rawLabel}: ${entry.raw}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleSourceLatestCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatMaybeValue, getLogLevelLabel, t.logs, visibleSourceActionHint, visibleTopSourceTimestamp, visibleTopSourceTrend]);

  const handleCopyVisibleTopSourceSummary = useCallback(async () => {
    if (!visibleTopSource?.latestEntry) { void message.error(t.logs.visibleTopSourceSummaryUnavailable); return; }
    const lines = [
      t.logs.visibleTopSourceSummaryTitle,
      `${t.logs.sourceLabel}: ${visibleTopSource.source}`,
      `${t.logs.visibleLinesLabel}: ${visibleTopSource.count}`,
      `${t.logs.visibleTopSourceShareLabel}: ${visibleTopSourceShare}%`,
      `${t.logs.visibleTopSourcesConcentrationLabel}: ${visibleTopSourcesConcentration}%`,
      `${t.logs.visibleSourceModeLabel}: ${visibleSourceMode.label}`,
      `${t.logs.visibleSourceActionHintLabel}: ${visibleSourceActionHint}`,
      `${t.logs.visibleTopSourceTimestampLabel}: ${visibleTopSourceTimestamp}`,
      `${t.logs.visibleTopSourceTrendLabel}: ${visibleTopSourceTrend.label} | 15m=${visibleTopSourceTrend.last15m} | 60m=${visibleTopSourceTrend.last60m}`,
      `${t.logs.latestLevelLabel}: ${getLogLevelLabel(visibleTopSource.latestEntry.level)}`,
      `${t.logs.latestMessageLabel}: ${visibleTopSource.latestEntry.message}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleTopSourceSummaryCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [getLogLevelLabel, t.logs, visibleSourceActionHint, visibleSourceMode.label, visibleTopSource, visibleTopSourceShare, visibleTopSourceTimestamp, visibleTopSourceTrend, visibleTopSourcesConcentration]);

  const handleCopyVisibleSourceDigest = useCallback(async (source: any) => {
    if (!source) { void message.error(t.logs.visibleSourceDigestUnavailable); return; }
    const lines = [
      t.logs.visibleSourceDigestTitle,
      `${t.logs.sourceLabel}: ${source.source}`,
      `${t.logs.visibleLinesLabel}: ${source.count}`,
      `${t.logs.visibleTopSourceShareLabel}: ${visibleTopSourceShare}%`,
      `${t.logs.visibleTopSourcesConcentrationLabel}: ${visibleTopSourcesConcentration}%`,
      `${t.logs.visibleSourceModeLabel}: ${visibleSourceMode.label}`,
      `${t.logs.visibleSourceModeHintLabel}: ${visibleSourceMode.hint}`,
      `${t.logs.visibleSourceActionHintLabel}: ${visibleSourceActionHint}`,
      `${t.logs.visibleTopSourceFreshnessLabel}: ${visibleTopSourceFreshness}`,
      `${t.logs.visibleTopSourceTimestampLabel}: ${visibleTopSourceTimestamp}`,
      `${t.logs.visibleTopSourceTrendLabel}: ${visibleTopSourceTrend.label} | 15m=${visibleTopSourceTrend.last15m} | 60m=${visibleTopSourceTrend.last60m}`,
      `${t.logs.latestLevelLabel}: ${getLogLevelLabel(source.latestEntry.level)}`,
      `${t.logs.latestTimestampLabel}: ${formatMaybeValue(source.latestEntry.timestamp, t.logs.unknownValue)}`,
      `${t.logs.latestMessageLabel}: ${source.latestEntry.message}`,
      `${t.logs.latestRawLabel}: ${source.latestEntry.raw}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleSourceDigestCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatMaybeValue, getLogLevelLabel, t.logs, visibleSourceMode, visibleSourceActionHint, visibleTopSourceFreshness, visibleTopSourceTimestamp, visibleTopSourceTrend, visibleTopSourceShare, visibleTopSourcesConcentration]);

  const handleCopyVisibleSources = useCallback(async () => {
    if (!visibleSources.length) { void message.error(t.logs.visibleSourcesUnavailable); return; }
    const lines = [
      t.logs.visibleSourcesDigestTitle,
      `${t.logs.visibleTopSourceShareLabel}: ${visibleTopSourceShare}%`,
      `${t.logs.visibleTopSourcesConcentrationLabel}: ${visibleTopSourcesConcentration}%`,
      `${t.logs.visibleSourceModeLabel}: ${visibleSourceMode.label}`,
      `${t.logs.visibleSourceModeHintLabel}: ${visibleSourceMode.hint}`,
      ...visibleSources.map(s => `${s.count}x | ${s.source} | ${getLogLevelLabel(s.latestEntry.level)} | ${s.latestEntry.message}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleSourcesCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [getLogLevelLabel, t.logs, visibleSourceMode, visibleSources, visibleTopSourceShare, visibleTopSourcesConcentration]);

  const handleCopyRecentIssueSourceDigest = useCallback(async (source: any) => {
    if (!source) { void message.error(t.logs.recentIssueSourceDigestUnavailable); return; }
    const lines = [
      t.logs.recentIssueSourceDigestTitle,
      `${t.logs.sourceLabel}: ${source.source}`,
      `${t.logs.issueLines60mLabel}: ${source.count}`,
      `${t.logs.highestLevelLabel}: ${getLogLevelLabel(source.level)}`,
      `${t.logs.latestIssueLevelLabel}: ${getLogLevelLabel(source.latestEntry.level)}`,
      `${t.logs.latestIssueTimestampLabel}: ${formatMaybeValue(source.latestEntry.timestamp, t.logs.unknownValue)}`,
      `${t.logs.latestIssueMessageLabel}: ${source.latestEntry.message}`,
      `${t.logs.latestIssueRawLabel}: ${source.latestEntry.raw}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.recentIssueSourceDigestCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatMaybeValue, getLogLevelLabel, t.logs]);

  const handleCopyIssueDigest = useCallback(async () => {
    const digestLines = [
      t.logs.logDigestTitle,
      `${t.logs.visibleEntriesLabel}: ${filteredEntries.length}/${entries.length}`,
      `${t.logs.issuesLabel}: ${issueEntries.length}`,
      `${t.logs.visibleErrorsLabel}: ${filteredCounts.error}`,
      `${t.logs.visibleWarningsLabel}: ${filteredCounts.warn}`,
      `${t.logs.visibleDebugLabel}: ${filteredCounts.debug}`,
      `${t.logs.visibleInfoLabel}: ${filteredCounts.info}`,
      `${t.logs.activeFilterLabel}: ${getLogLevelLabel(filter)}`,
      `${t.logs.recentWindowOnlyLabel}: ${recentWindowOnly ? t.common.yes : t.common.no}`,
      `${t.logs.sortOrderLabel}: ${getSortOrderLabel(sortOrder)}`,
      `${t.logs.searchLabel}: ${formatMaybeValue(query.trim())}`,
      `${t.logs.latestVisibleIssueLabel}: ${formatIssueSummary(latestVisibleIssue)}`,
      `${t.logs.latestVisibleSourceLabel}: ${formatMaybeValue(latestVisibleIssue?.source)}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(digestLines.join('\n'));
      void message.success(t.logs.digestCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [entries.length, filter, filteredCounts, filteredEntries.length, formatIssueSummary, formatMaybeValue, getLogLevelLabel, getSortOrderLabel, issueEntries.length, latestVisibleIssue, query, recentWindowOnly, sortOrder, t.common, t.logs]);

  const handleCopyRecentIssueDigest = useCallback(async () => {
    const latestRecentIssue = recentIssueEntries[0] ?? null;
    const digestLines = [
      t.logs.recentIncidentDigestTitle,
      `${t.logs.incidentsLast60Label}: ${recentIssueEntries.length}`,
      `${t.logs.recentErrorsLabel}: ${recentIssueBreakdown.error}`,
      `${t.logs.recentWarningsLabel}: ${recentIssueBreakdown.warn}`,
      `${t.logs.latestRecentIssueLabel}: ${formatIssueSummary(latestRecentIssue)}`,
    ];
    try {
      await navigator.clipboard.writeText(digestLines.join('\n'));
      void message.success(t.logs.recentIssueDigestCopied);
    } catch { void message.error(t.logs.copyFailed); }
  }, [formatIssueSummary, recentIssueBreakdown, recentIssueEntries, t.logs]);

  const handleExportVisibleLogs = useCallback(() => {
    const content = filteredEntries.map(e => e.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pro5-logs-${filter}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    void message.success(t.logs.exported);
  }, [filteredEntries, filter, t.logs]);

  const handleResetFilters = useCallback(() => {
    setFilter('all'); setQuery(''); setSourceFilter(''); setRecentWindowOnly(false); setSortOrder('newest');
    void message.success(t.logs.filtersReset);
  }, [t.logs]);

  const handleResetViewState = useCallback(() => {
    handleResetFilters();
    if (typeof window !== 'undefined') window.localStorage.removeItem(LOGS_VIEW_STORAGE_KEY);
    void message.success(t.logs.viewStateReset);
  }, [handleResetFilters, t.logs]);

  const handleRecentIssuesPreset = useCallback(() => {
    setFilter('issues'); setQuery(''); setSourceFilter(''); setRecentWindowOnly(true);
    void message.success(t.logs.recentIssuesPresetApplied);
  }, [t.logs]);

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; label: string; onClose: () => void }> = [];
    if (filter === 'issues') tags.push({ key: 'issues', label: t.logs.issuesOnly, onClose: () => setFilter('all') });
    else if (filter !== 'all') tags.push({ key: 'level', label: `${t.logs.levelFilterLabel}: ${getLogLevelLabel(filter)}`, onClose: () => setFilter('all') });
    if (recentWindowOnly) tags.push({ key: 'recent-window', label: t.logs.recentWindowOnly, onClose: () => setRecentWindowOnly(false) });
    if (sortOrder === 'oldest') tags.push({ key: 'sort-order', label: `${t.logs.sortFilterLabel}: ${t.logs.sortOldest}`, onClose: () => setSortOrder('newest') });
    if (query.trim()) tags.push({ key: 'query', label: `${t.logs.searchFilterLabel}: ${query.trim()}`, onClose: () => setQuery('') });
    if (sourceFilter) tags.push({ key: 'source', label: `${t.logs.sourceFilterLabel}: ${sourceFilter}`, onClose: () => setSourceFilter('') });
    return tags;
  }, [filter, getLogLevelLabel, query, recentWindowOnly, sortOrder, sourceFilter, t.logs]);

  return {
    t, entries, loading, filter, query, sourceFilter, autoRefresh, recentWindowOnly, sortOrder, lastRefreshedAt,
    setFilter, setQuery, setSourceFilter, setAutoRefresh, setRecentWindowOnly, setSortOrder,
    filteredEntries, matchedEntries, sourceOptions, counts, filteredCounts, visibleIssueRatio,
    latestIssue, latestVisibleIssue, issueStreak, recentIssueCount, recentIssueEntries, recentIssueBreakdown,
    visibleIssueTrend, visibleTrendStatus, visibleSources, visibleTopSource, visibleTopSourceShare,
    visibleTopSourceFreshness, visibleTopSourceTimestamp, visibleTopSourceTrend, visibleTopSourcesConcentration,
    visibleSourceMode, visibleSourceActionHint, visibleSourceActionButtonLabel,
    repeatedRecentIssues, repeatedRecentIssue, repeatedRecentSources, hottestRecentSource, activeFilterTags,
    loadLogs, handleCopySingleLog, handleCopyVisibleLogs, handleCopyIssues, handleCopyIssueDigest, handleCopyRecentIssueDigest,
    handleCopyLatestIssue, handleFocusLatestIssue, handleFocusVisibleIssue, handleCopyVisibleIssue,
    handleCopyVisibleSliceSummary, handleFocusRepeatedRecentIssue, handleFocusRecentIssueSource,
    handleOpenRecentIssueSourceLatest, handleCopyRecentIssueSourceLatest, handleCopyRepeatedRecentIssues,
    handleCopyRecentIssueSources, handleFocusVisibleSource, handleOpenVisibleSourceLatest,
    handleCopyVisibleSourceLatest, handleCopyVisibleTopSourceSummary, handleCopyVisibleSourceDigest,
    handleCopyVisibleSources, handleCopyRecentIssueSourceDigest, handleRunSelfTest, handleExportVisibleLogs,
    handleResetFilters, handleResetViewState, handleRecentIssuesPreset,
    highlightSearchMatch, formatTimestamp, formatRelativeTime, getLogLevelLabel
  };
};
