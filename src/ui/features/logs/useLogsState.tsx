import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { type ParsedLogEntry } from './logParsing';
import {
  buildIssueDigestText,
  buildLogEntryDetailsText,
  buildRecentIssueDigestText,
  buildRecentIssueSourceDigestText,
  buildRecentIssueSourceLatestText,
  buildRepeatedRecentIssuesText,
  buildRepeatedRecentSourcesText,
  buildVisibleSliceSummaryText,
  buildVisibleSourceDigestText,
  buildVisibleSourceLatestText,
  buildVisibleSourcesText,
  buildVisibleTopSourceSummaryText,
  type LogsCopyTextContext,
} from './logsCopyText';
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
  getRecentIssueBreakdown,
  getDefaultLogsViewState,
  isWithinLastMinutes,
  parseStoredLogsViewState,
  sortLogEntries,
  type LogsFilter,
  type LogsSortOrder,
  type RepeatedRecentIssueSummary,
  type RepeatedRecentSourceSummary,
  type SourceOption,
  type StoredLogsViewState,
  type VisibleSourceSummary,
} from './logsState.utils';

const LOGS_VIEW_STORAGE_KEY = 'pro5.logs.view';

export interface LogsRouteState {
  presetQuery?: string;
  presetFilter?: LogsFilter;
  presetSourceFilter?: string;
  presetRecentWindowOnly?: boolean;
  presetSortOrder?: LogsSortOrder;
}

export interface LogsState {
  t: ReturnType<typeof useTranslation>['t'];
  entries: ParsedLogEntry[];
  loading: boolean;
  filter: LogsFilter;
  query: string;
  sourceFilter: string;
  autoRefresh: boolean;
  recentWindowOnly: boolean;
  sortOrder: LogsSortOrder;
  lastRefreshedAt: string | null;
  
  // Setters
  setFilter: (v: LogsFilter) => void;
  setQuery: (v: string) => void;
  setSourceFilter: (v: string) => void;
  setAutoRefresh: (v: boolean) => void;
  setRecentWindowOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSortOrder: (v: LogsSortOrder) => void;
  
  // Derived
  filteredEntries: ParsedLogEntry[];
  matchedEntries: ParsedLogEntry[];
  issueEntries: ParsedLogEntry[];
  sourceOptions: SourceOption[];
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
  visibleSources: VisibleSourceSummary[];
  visibleTopSource: VisibleSourceSummary | null;
  visibleTopSourceShare: number;
  visibleTopSourceFreshness: string;
  visibleTopSourceTimestamp: string;
  visibleTopSourceTrend: { last15m: number; last60m: number; label: string };
  visibleTopSourcesConcentration: number;
  visibleSourceMode: { label: string; hint: string };
  visibleSourceActionHint: string;
  visibleSourceActionButtonLabel: string;
  repeatedRecentIssues: RepeatedRecentIssueSummary[];
  repeatedRecentIssue: RepeatedRecentIssueSummary | null;
  repeatedRecentSources: RepeatedRecentSourceSummary[];
  hottestRecentSource: RepeatedRecentSourceSummary | null;
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
  handleCopyVisibleSourceLatest: (source: VisibleSourceSummary | null | undefined) => Promise<void>;
  handleCopyVisibleTopSourceSummary: () => Promise<void>;
  handleCopyVisibleSourceDigest: (source: VisibleSourceSummary | null | undefined) => Promise<void>;
  handleCopyVisibleSources: () => Promise<void>;
  handleCopyRecentIssueSourceDigest: (source: RepeatedRecentSourceSummary | null | undefined) => Promise<void>;
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

export const useLogsState = (): LogsState => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const initialViewState = useMemo<StoredLogsViewState>(() => {
    if (typeof window === 'undefined') {
      return getDefaultLogsViewState();
    }
    return parseStoredLogsViewState(window.localStorage.getItem(LOGS_VIEW_STORAGE_KEY));
  }, []);

  const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<LogsFilter>(initialViewState.filter);
  const [query, setQuery] = useState(initialViewState.query);
  const [sourceFilter, setSourceFilter] = useState(initialViewState.sourceFilter);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [recentWindowOnly, setRecentWindowOnly] = useState(initialViewState.recentWindowOnly);
  const [sortOrder, setSortOrder] = useState<LogsSortOrder>(initialViewState.sortOrder);
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
    return filterLogEntries(entries, { filter, query, sourceFilter, recentWindowOnly });
  }, [entries, filter, query, recentWindowOnly, sourceFilter]);

  const filteredEntries = useMemo(
    () => sortLogEntries(matchedEntries, sortOrder),
    [matchedEntries, sortOrder],
  );

  const sourceOptions = useMemo(
    () => buildSourceOptions(entries),
    [entries],
  );

  const counts = useMemo(() => countLogLevels(entries), [entries]);

  const filteredCounts = useMemo(() => countLogLevels(filteredEntries), [filteredEntries]);

  const visibleIssueRatio = useMemo(() => {
    if (!filteredEntries.length) return 0;
    return Math.round(((filteredCounts.error + filteredCounts.warn) / filteredEntries.length) * 100);
  }, [filteredCounts.error, filteredCounts.warn, filteredEntries.length]);

  const latestIssue = useMemo(() => findLatestIssue(entries), [entries]);

  const latestVisibleIssue = useMemo(() => findLatestIssue(matchedEntries), [matchedEntries]);

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

  const copyTextContext = useMemo<LogsCopyTextContext>(() => ({
    labels: {
      yes: t.common.yes,
      no: t.common.no,
      noneValue: t.settings.noneValue,
      unknownValue: t.logs.unknownValue,
      levelLabel: t.logs.levelLabel,
      timestampLabel: t.logs.timestampLabel,
      messageLabel: t.logs.messageLabel,
      rawLabel: t.logs.rawLabel,
      sourceLabel: t.logs.sourceLabel,
      visibleLogSliceTitle: t.logs.visibleLogSliceTitle,
      visibleEntriesLabel: t.logs.visibleEntriesLabel,
      visibleErrorsLabel: t.logs.visibleErrorsLabel,
      visibleWarningsLabel: t.logs.visibleWarningsLabel,
      visibleDebugLabel: t.logs.visibleDebugLabel,
      visibleInfoLabel: t.logs.visibleInfoLabel,
      visibleHeatLabel: t.logs.visibleHeatLabel,
      levelFilterLabel: t.logs.levelFilterLabel,
      recentWindowOnlyLabel: t.logs.recentWindowOnlyLabel,
      sortOrderLabel: t.logs.sortOrderLabel,
      searchLabel: t.logs.searchLabel,
      visibleIssuesLast15Label: t.logs.visibleIssuesLast15Label,
      visibleIssuesLast60Label: t.logs.visibleIssuesLast60Label,
      latestVisibleIssueLabel: t.logs.latestVisibleIssueLabel,
      latestVisibleSourceLabel: t.logs.latestVisibleSourceLabel,
      recentIssueSourceLatestTitle: t.logs.recentIssueSourceLatestTitle,
      repeatedRecentIssuesTitle: 'Pro5 repeated recent issues',
      repeatedRecentSourcesTitle: 'Pro5 repeated recent issue sources',
      visibleSourceLatestTitle: t.logs.visibleSourceLatestTitle,
      visibleLinesLabel: t.logs.visibleLinesLabel,
      visibleSourceActionHintLabel: t.logs.visibleSourceActionHintLabel,
      visibleTopSourceTimestampLabel: t.logs.visibleTopSourceTimestampLabel,
      visibleTopSourceTrendLabel: t.logs.visibleTopSourceTrendLabel,
      visibleTopSourceSummaryTitle: t.logs.visibleTopSourceSummaryTitle,
      visibleTopSourceShareLabel: t.logs.visibleTopSourceShareLabel,
      visibleTopSourcesConcentrationLabel: t.logs.visibleTopSourcesConcentrationLabel,
      visibleSourceModeLabel: t.logs.visibleSourceModeLabel,
      latestLevelLabel: t.logs.latestLevelLabel,
      latestMessageLabel: t.logs.latestMessageLabel,
      visibleSourceDigestTitle: t.logs.visibleSourceDigestTitle,
      visibleSourceModeHintLabel: t.logs.visibleSourceModeHintLabel,
      visibleTopSourceFreshnessLabel: t.logs.visibleTopSourceFreshnessLabel,
      latestTimestampLabel: t.logs.latestTimestampLabel,
      latestRawLabel: t.logs.latestRawLabel,
      visibleSourcesDigestTitle: t.logs.visibleSourcesDigestTitle,
      recentIssueSourceDigestTitle: t.logs.recentIssueSourceDigestTitle,
      issueLines60mLabel: t.logs.issueLines60mLabel,
      highestLevelLabel: t.logs.highestLevelLabel,
      latestIssueLevelLabel: t.logs.latestIssueLevelLabel,
      latestIssueTimestampLabel: t.logs.latestIssueTimestampLabel,
      latestIssueMessageLabel: t.logs.latestIssueMessageLabel,
      latestIssueRawLabel: t.logs.latestIssueRawLabel,
      logDigestTitle: t.logs.logDigestTitle,
      issuesLabel: t.logs.issuesLabel,
      activeFilterLabel: t.logs.activeFilterLabel,
      recentIncidentDigestTitle: t.logs.recentIncidentDigestTitle,
      incidentsLast60Label: t.logs.incidentsLast60Label,
      recentErrorsLabel: t.logs.recentErrorsLabel,
      recentWarningsLabel: t.logs.recentWarningsLabel,
      latestRecentIssueLabel: t.logs.latestRecentIssueLabel,
    },
    formatters: {
      formatIssueSummary,
      formatMaybeValue,
      getLogLevelLabel,
      getSortOrderLabel,
    },
  }), [formatIssueSummary, formatMaybeValue, getLogLevelLabel, getSortOrderLabel, t.common.no, t.common.yes, t.logs, t.settings.noneValue]);

  const copyText = useCallback(async (content: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(content);
      void message.success(successMessage);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [t.logs]);

  const issueStreak = useMemo(() => calculateIssueStreak(entries), [entries]);

  const handleCopySingleLog = useCallback(async (raw: string) => {
    await copyText(raw, t.logs.copied);
  }, [copyText, t.logs.copied]);

  const handleCopyVisibleLogs = useCallback(async () => {
    await copyText(filteredEntries.map((entry) => entry.raw).join('\n'), t.logs.copied);
  }, [copyText, filteredEntries, t.logs.copied]);

  const issueEntries = useMemo(() => filterIssueEntries(matchedEntries), [matchedEntries]);

  const recentIssueCount = useMemo(() => countRecentIssues(entries, 60), [entries]);

  const recentIssueBreakdown = useMemo(() => getRecentIssueBreakdown(entries), [entries]);

  const recentIssueEntries = useMemo(
    () => filterIssueEntries(entries).filter((entry) => isWithinLastMinutes(entry.timestamp, 60)),
    [entries],
  );

  const visibleIssueTrend = useMemo(() => calculateVisibleIssueTrend(matchedEntries), [matchedEntries]);

  const visibleTrendStatus = useMemo(() => {
    if (visibleIssueTrend.last15m >= 3) return { tone: 'error' as const, label: t.logs.visibleTrendHot };
    if (visibleIssueTrend.last15m > 0 || visibleIssueTrend.last60m >= 5) return { tone: 'warning' as const, label: t.logs.visibleTrendElevated };
    return { tone: 'info' as const, label: t.logs.visibleTrendCalm };
  }, [t.logs, visibleIssueTrend]);

  const visibleSources = useMemo(() => buildVisibleSources(matchedEntries), [matchedEntries]);

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

  const repeatedRecentIssues = useMemo(
    () => buildRepeatedRecentIssues(recentIssueEntries),
    [recentIssueEntries],
  );

  const repeatedRecentIssue = repeatedRecentIssues[0] ?? null;

  const repeatedRecentSources = useMemo(
    () => buildRepeatedRecentSources(recentIssueEntries),
    [recentIssueEntries],
  );

  const hottestRecentSource = repeatedRecentSources[0] ?? null;

  const handleCopyIssues = useCallback(async () => {
    await copyText(issueEntries.map((e) => e.raw).join('\n'), t.logs.issuesCopied);
  }, [copyText, issueEntries, t.logs.issuesCopied]);

  const handleRunSelfTest = useCallback(async () => {
    const res = await apiClient.post('/api/support/self-test');
    if (!res.success) { void message.error(res.error); return; }
    void message.success(t.logs.selfTestRan);
  }, [t.logs]);

  const handleCopyLatestIssue = useCallback(async () => {
    if (!latestIssue) return;
    await copyText(buildLogEntryDetailsText(copyTextContext, latestIssue), t.logs.latestIssueCopied);
  }, [copyText, copyTextContext, latestIssue, t.logs.latestIssueCopied]);

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
    await copyText(buildLogEntryDetailsText(copyTextContext, latestVisibleIssue), t.logs.visibleIssueCopied);
  }, [copyText, copyTextContext, latestVisibleIssue, t.logs.visibleIssueCopied]);

  const handleCopyVisibleSliceSummary = useCallback(async () => {
    await copyText(buildVisibleSliceSummaryText(copyTextContext, {
      totalEntries: entries.length,
      visibleEntries: filteredEntries.length,
      filteredCounts,
      visibleTrendLabel: visibleTrendStatus.label,
      filter,
      recentWindowOnly,
      sortOrder,
      query,
      visibleIssueTrend,
      latestVisibleIssue,
    }), t.logs.visibleSliceCopied);
  }, [copyText, copyTextContext, entries.length, filter, filteredCounts, filteredEntries.length, latestVisibleIssue, query, recentWindowOnly, sortOrder, t.logs.visibleSliceCopied, visibleIssueTrend, visibleTrendStatus.label]);

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
    await copyText(buildRecentIssueSourceLatestText(copyTextContext, source, entry), t.logs.recentIssueSourceLatestCopied);
  }, [copyText, copyTextContext, t.logs.recentIssueSourceLatestCopied]);

  const handleCopyRepeatedRecentIssues = useCallback(async () => {
    await copyText(buildRepeatedRecentIssuesText(copyTextContext, repeatedRecentIssues), t.logs.repeatedRecentIssuesCopied);
  }, [copyText, copyTextContext, repeatedRecentIssues, t.logs.repeatedRecentIssuesCopied]);

  const handleCopyRecentIssueSources = useCallback(async () => {
    await copyText(buildRepeatedRecentSourcesText(copyTextContext, repeatedRecentSources), t.logs.recentIssueSourcesCopied);
  }, [copyText, copyTextContext, repeatedRecentSources, t.logs.recentIssueSourcesCopied]);

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

  const handleCopyVisibleSourceLatest = useCallback(async (source: VisibleSourceSummary | null | undefined) => {
    if (!source?.latestEntry) { void message.error(t.logs.visibleSourceLatestUnavailable); return; }
    await copyText(buildVisibleSourceLatestText(copyTextContext, {
      source,
      actionHint: visibleSourceActionHint,
      topSourceTimestamp: visibleTopSourceTimestamp,
      topSourceTrend: visibleTopSourceTrend,
    }), t.logs.visibleSourceLatestCopied);
  }, [copyText, copyTextContext, t.logs, visibleSourceActionHint, visibleTopSourceTimestamp, visibleTopSourceTrend]);

  const handleCopyVisibleTopSourceSummary = useCallback(async () => {
    if (!visibleTopSource?.latestEntry) { void message.error(t.logs.visibleTopSourceSummaryUnavailable); return; }
    await copyText(buildVisibleTopSourceSummaryText(copyTextContext, {
      source: visibleTopSource,
      sharePercent: visibleTopSourceShare,
      concentrationPercent: visibleTopSourcesConcentration,
      modeLabel: visibleSourceMode.label,
      actionHint: visibleSourceActionHint,
      topSourceTimestamp: visibleTopSourceTimestamp,
      topSourceTrend: visibleTopSourceTrend,
    }), t.logs.visibleTopSourceSummaryCopied);
  }, [copyText, copyTextContext, t.logs, visibleSourceActionHint, visibleSourceMode.label, visibleTopSource, visibleTopSourceShare, visibleTopSourceTimestamp, visibleTopSourceTrend, visibleTopSourcesConcentration]);

  const handleCopyVisibleSourceDigest = useCallback(async (source: VisibleSourceSummary | null | undefined) => {
    if (!source) { void message.error(t.logs.visibleSourceDigestUnavailable); return; }
    await copyText(buildVisibleSourceDigestText(copyTextContext, {
      source,
      sharePercent: visibleTopSourceShare,
      concentrationPercent: visibleTopSourcesConcentration,
      mode: visibleSourceMode,
      actionHint: visibleSourceActionHint,
      topSourceFreshness: visibleTopSourceFreshness,
      topSourceTimestamp: visibleTopSourceTimestamp,
      topSourceTrend: visibleTopSourceTrend,
    }), t.logs.visibleSourceDigestCopied);
  }, [copyText, copyTextContext, t.logs, visibleSourceMode, visibleSourceActionHint, visibleTopSourceFreshness, visibleTopSourceTimestamp, visibleTopSourceTrend, visibleTopSourceShare, visibleTopSourcesConcentration]);

  const handleCopyVisibleSources = useCallback(async () => {
    if (!visibleSources.length) { void message.error(t.logs.visibleSourcesUnavailable); return; }
    await copyText(buildVisibleSourcesText(copyTextContext, {
      sources: visibleSources,
      sharePercent: visibleTopSourceShare,
      concentrationPercent: visibleTopSourcesConcentration,
      mode: visibleSourceMode,
    }), t.logs.visibleSourcesCopied);
  }, [copyText, copyTextContext, t.logs, visibleSourceMode, visibleSources, visibleTopSourceShare, visibleTopSourcesConcentration]);

  const handleCopyRecentIssueSourceDigest = useCallback(async (source: RepeatedRecentSourceSummary | null | undefined) => {
    if (!source) { void message.error(t.logs.recentIssueSourceDigestUnavailable); return; }
    await copyText(buildRecentIssueSourceDigestText(copyTextContext, source), t.logs.recentIssueSourceDigestCopied);
  }, [copyText, copyTextContext, t.logs.recentIssueSourceDigestCopied]);

  const handleCopyIssueDigest = useCallback(async () => {
    await copyText(buildIssueDigestText(copyTextContext, {
      totalEntries: entries.length,
      visibleEntries: filteredEntries.length,
      issueCount: issueEntries.length,
      filteredCounts,
      filter,
      recentWindowOnly,
      sortOrder,
      query,
      latestVisibleIssue,
    }), t.logs.digestCopied);
  }, [copyText, copyTextContext, entries.length, filter, filteredCounts, filteredEntries.length, issueEntries.length, latestVisibleIssue, query, recentWindowOnly, sortOrder, t.logs.digestCopied]);

  const handleCopyRecentIssueDigest = useCallback(async () => {
    const latestRecentIssue = recentIssueEntries[0] ?? null;
    await copyText(buildRecentIssueDigestText(copyTextContext, {
      recentIssueCount: recentIssueEntries.length,
      recentIssueBreakdown,
      latestRecentIssue,
    }), t.logs.recentIssueDigestCopied);
  }, [copyText, copyTextContext, recentIssueBreakdown, recentIssueEntries, t.logs.recentIssueDigestCopied]);

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
    filteredEntries, matchedEntries, issueEntries, sourceOptions, counts, filteredCounts, visibleIssueRatio,
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
