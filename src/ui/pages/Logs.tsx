import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, List, Row, Select, Space, Statistic, Switch, Tag, Typography, message } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';

const LOGS_VIEW_STORAGE_KEY = 'pro5.logs.view';

interface ParsedLogEntry {
  timestamp: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  raw: string;
}

interface StoredLogsViewState {
  filter: 'all' | 'issues' | 'info' | 'warn' | 'error';
  query: string;
  recentWindowOnly: boolean;
  sortOrder: 'newest' | 'oldest';
}

function parseLogEntry(line: string): ParsedLogEntry {
  const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
  if (!match) {
    return {
      timestamp: null,
      level: 'info',
      message: line,
      raw: line,
    };
  }

  const [, timestamp, level, message] = match;
  const normalizedLevel = level.toLowerCase();

  return {
    timestamp,
    level: normalizedLevel === 'error' || normalizedLevel === 'warn' ? normalizedLevel : 'info',
    message,
    raw: line,
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

function formatRelativeTime(
  value: string | null,
  labels: {
    justNow: string;
    minutesAgo: (count: number) => string;
    hoursAgo: (count: number) => string;
    daysAgo: (count: number) => string;
  },
): string {
  if (!value) return '—';

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) return labels.justNow;
  if (diffMinutes < 60) return labels.minutesAgo(diffMinutes);

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return labels.hoursAgo(diffHours);

  const diffDays = Math.round(diffHours / 24);
  return labels.daysAgo(diffDays);
}

function isWithinLastMinutes(value: string | null, minutes: number): boolean {
  if (!value) return false;
  const diffMs = Date.now() - new Date(value).getTime();
  return diffMs >= 0 && diffMs <= minutes * 60_000;
}

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const initialViewState = useMemo<StoredLogsViewState>(() => {
    if (typeof window === 'undefined') {
      return {
        filter: 'all',
        query: '',
        recentWindowOnly: false,
        sortOrder: 'newest',
      };
    }

    try {
      const rawValue = window.localStorage.getItem(LOGS_VIEW_STORAGE_KEY);
      if (!rawValue) {
        return {
          filter: 'all',
          query: '',
          recentWindowOnly: false,
          sortOrder: 'newest',
        };
      }

      const parsed = JSON.parse(rawValue) as Partial<StoredLogsViewState>;

      return {
        filter: parsed.filter === 'issues' || parsed.filter === 'info' || parsed.filter === 'warn' || parsed.filter === 'error' ? parsed.filter : 'all',
        query: typeof parsed.query === 'string' ? parsed.query : '',
        recentWindowOnly: Boolean(parsed.recentWindowOnly),
        sortOrder: parsed.sortOrder === 'oldest' ? 'oldest' : 'newest',
      };
    } catch {
      return {
        filter: 'all',
        query: '',
        recentWindowOnly: false,
        sortOrder: 'newest',
      };
    }
  }, []);

  const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'issues' | 'info' | 'warn' | 'error'>(initialViewState.filter);
  const [query, setQuery] = useState(initialViewState.query);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [recentWindowOnly, setRecentWindowOnly] = useState(initialViewState.recentWindowOnly);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>(initialViewState.sortOrder);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<string[]>('/api/logs');
    setLoading(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setEntries(res.data.slice().reverse().map(parseLogEntry));
    setLastRefreshedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = window.setInterval(() => {
      void loadLogs();
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [autoRefresh, loadLogs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nextState: StoredLogsViewState = {
      filter,
      query,
      recentWindowOnly,
      sortOrder,
    };

    window.localStorage.setItem(LOGS_VIEW_STORAGE_KEY, JSON.stringify(nextState));
  }, [filter, query, recentWindowOnly, sortOrder]);

  const matchedEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const levelMatches = filter === 'all'
        || (filter === 'issues' ? entry.level === 'warn' || entry.level === 'error' : entry.level === filter);
      const windowMatches = !recentWindowOnly || isWithinLastMinutes(entry.timestamp, 60);
      const queryMatches = !normalizedQuery || entry.raw.toLowerCase().includes(normalizedQuery);
      return levelMatches && windowMatches && queryMatches;
    });
  }, [entries, filter, query, recentWindowOnly]);

  const filteredEntries = useMemo(
    () => (sortOrder === 'oldest' ? matchedEntries.slice().reverse() : matchedEntries),
    [matchedEntries, sortOrder],
  );

  const counts = useMemo(() => ({
    info: entries.filter((entry) => entry.level === 'info').length,
    warn: entries.filter((entry) => entry.level === 'warn').length,
    error: entries.filter((entry) => entry.level === 'error').length,
  }), [entries]);

  const filteredCounts = useMemo(() => ({
    info: filteredEntries.filter((entry) => entry.level === 'info').length,
    warn: filteredEntries.filter((entry) => entry.level === 'warn').length,
    error: filteredEntries.filter((entry) => entry.level === 'error').length,
  }), [filteredEntries]);

  const latestIssue = useMemo(
    () => entries.find((entry) => entry.level === 'warn' || entry.level === 'error') ?? null,
    [entries],
  );

  const latestVisibleIssue = useMemo(
    () => matchedEntries.find((entry) => entry.level === 'warn' || entry.level === 'error') ?? null,
    [matchedEntries],
  );

  const issueStreak = useMemo(() => {
    let streak = 0;

    for (const entry of entries) {
      if (entry.level === 'warn' || entry.level === 'error') {
        streak += 1;
        continue;
      }

      break;
    }

    return streak;
  }, [entries]);

  const handleCopyVisibleLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filteredEntries.map((entry) => entry.raw).join('\n'));
      void message.success(t.logs.copied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [filteredEntries, t.logs.copied, t.logs.copyFailed]);

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
    if (visibleIssueTrend.last15m >= 3) {
      return {
        tone: 'error' as const,
        label: t.logs.visibleTrendHot,
      };
    }

    if (visibleIssueTrend.last15m > 0 || visibleIssueTrend.last60m >= 5) {
      return {
        tone: 'warning' as const,
        label: t.logs.visibleTrendElevated,
      };
    }

    return {
      tone: 'info' as const,
      label: t.logs.visibleTrendCalm,
    };
  }, [t.logs.visibleTrendCalm, t.logs.visibleTrendElevated, t.logs.visibleTrendHot, visibleIssueTrend.last15m, visibleIssueTrend.last60m]);

  const repeatedRecentIssues = useMemo(() => {
    const countsByMessage = new Map<string, { count: number; level: 'warn' | 'error'; message: string }>();

    for (const entry of recentIssueEntries) {
      const current = countsByMessage.get(entry.message);
      if (current) {
        current.count += 1;
        if (entry.level === 'error') current.level = 'error';
        continue;
      }

      countsByMessage.set(entry.message, {
        count: 1,
        level: entry.level,
        message: entry.message,
      });
    }

    return Array.from(countsByMessage.values())
      .filter((entry) => entry.count > 1)
      .sort((left, right) => right.count - left.count)
      .slice(0, 3);
  }, [recentIssueEntries]);

  const repeatedRecentIssue = repeatedRecentIssues[0] ?? null;

  const handleCopyIssues = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(issueEntries.map((entry) => entry.raw).join('\n'));
      void message.success(t.logs.issuesCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [issueEntries, t.logs.copyFailed, t.logs.issuesCopied]);

  const handleRunSelfTest = useCallback(async () => {
    const res = await apiClient.post('/api/support/self-test');
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.logs.selfTestRan);
  }, [t.logs.selfTestRan]);

  const handleCopySingleLog = useCallback(async (raw: string) => {
    try {
      await navigator.clipboard.writeText(raw);
      void message.success(t.logs.singleCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [t.logs.copyFailed, t.logs.singleCopied]);

  const handleExportVisibleLogs = useCallback(() => {
    const content = filteredEntries.map((entry) => entry.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `pro5-logs-${filter}-${stamp}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    void message.success(t.logs.exported);
  }, [filteredEntries, filter, t.logs.exported]);

  const handleResetFilters = useCallback(() => {
    setFilter('all');
    setQuery('');
    setRecentWindowOnly(false);
    setSortOrder('newest');
    void message.success(t.logs.filtersReset);
  }, [t.logs.filtersReset]);

  const handleRecentIssuesPreset = useCallback(() => {
    setFilter('issues');
    setRecentWindowOnly(true);
    void message.success(t.logs.recentIssuesPresetApplied);
  }, [t.logs.recentIssuesPresetApplied]);

  const handleCopyRecentIssueDigest = useCallback(async () => {
    const latestRecentIssue = recentIssueEntries[0] ?? null;
    const digestLines = [
      'Pro5 recent incident digest',
      `Incidents in last 60 minutes: ${recentIssueEntries.length}`,
      `Recent errors: ${recentIssueBreakdown.error}`,
      `Recent warnings: ${recentIssueBreakdown.warn}`,
      latestRecentIssue
        ? `Latest recent issue: ${latestRecentIssue.level.toUpperCase()} | ${latestRecentIssue.timestamp ?? 'unknown'} | ${latestRecentIssue.message}`
        : 'Latest recent issue: none',
    ];

    try {
      await navigator.clipboard.writeText(digestLines.join('\n'));
      void message.success(t.logs.recentIssueDigestCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [recentIssueBreakdown.error, recentIssueBreakdown.warn, recentIssueEntries, t.logs.copyFailed, t.logs.recentIssueDigestCopied]);

  const handleCopyIssueDigest = useCallback(async () => {
    const digestLines = [
      'Pro5 log digest',
      `Visible entries: ${filteredEntries.length}/${entries.length}`,
      `Issues: ${issueEntries.length}`,
      `Visible errors: ${filteredCounts.error}`,
      `Visible warnings: ${filteredCounts.warn}`,
      `Visible info: ${filteredCounts.info}`,
      `Active filter: ${filter}`,
      `Recent window only: ${recentWindowOnly ? 'yes' : 'no'}`,
      `Sort order: ${sortOrder}`,
      query.trim() ? `Search: ${query.trim()}` : 'Search: none',
      latestVisibleIssue
        ? `Latest visible issue: ${latestVisibleIssue.level.toUpperCase()} | ${latestVisibleIssue.timestamp ?? 'unknown'} | ${latestVisibleIssue.message}`
        : 'Latest visible issue: none',
    ];

    try {
      await navigator.clipboard.writeText(digestLines.join('\n'));
      void message.success(t.logs.digestCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [entries.length, filter, filteredCounts.error, filteredCounts.info, filteredCounts.warn, filteredEntries.length, issueEntries.length, latestVisibleIssue, query, recentWindowOnly, sortOrder, t.logs.copyFailed, t.logs.digestCopied]);

  const handleCopyLatestIssue = useCallback(async () => {
    if (!latestIssue) return;

    const lines = [
      `Level: ${latestIssue.level.toUpperCase()}`,
      `Timestamp: ${latestIssue.timestamp ?? 'unknown'}`,
      `Message: ${latestIssue.message}`,
      `Raw: ${latestIssue.raw}`,
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.latestIssueCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [latestIssue, t.logs.copyFailed, t.logs.latestIssueCopied]);

  const handleFocusLatestIssue = useCallback(() => {
    if (!latestIssue) return;

    setFilter('issues');
    setQuery(latestIssue.message);
    void message.success(t.logs.focusLatestIssueApplied);
  }, [latestIssue, t.logs.focusLatestIssueApplied]);

  const handleFocusVisibleIssue = useCallback(() => {
    if (!latestVisibleIssue) return;

    setFilter('issues');
    setQuery(latestVisibleIssue.message);
    void message.success(t.logs.focusVisibleIssueApplied);
  }, [latestVisibleIssue, t.logs.focusVisibleIssueApplied]);

  const handleCopyVisibleIssue = useCallback(async () => {
    if (!latestVisibleIssue) return;

    const lines = [
      `Level: ${latestVisibleIssue.level.toUpperCase()}`,
      `Timestamp: ${latestVisibleIssue.timestamp ?? 'unknown'}`,
      `Message: ${latestVisibleIssue.message}`,
      `Raw: ${latestVisibleIssue.raw}`,
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleIssueCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [latestVisibleIssue, t.logs.copyFailed, t.logs.visibleIssueCopied]);

  const handleCopyVisibleSliceSummary = useCallback(async () => {
    const lines = [
      'Pro5 visible log slice',
      `Visible entries: ${filteredEntries.length}/${entries.length}`,
      `Visible errors: ${filteredCounts.error}`,
      `Visible warnings: ${filteredCounts.warn}`,
      `Visible info: ${filteredCounts.info}`,
      `Recent window only: ${recentWindowOnly ? 'yes' : 'no'}`,
      `Sort order: ${sortOrder}`,
      `Search: ${query.trim() || 'none'}`,
      `Visible issues in last 15 minutes: ${visibleIssueTrend.last15m}`,
      `Visible issues in last 60 minutes: ${visibleIssueTrend.last60m}`,
      latestVisibleIssue
        ? `Latest visible issue: ${latestVisibleIssue.level.toUpperCase()} | ${latestVisibleIssue.timestamp ?? 'unknown'} | ${latestVisibleIssue.message}`
        : 'Latest visible issue: none',
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.visibleSliceCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [
    entries.length,
    filteredCounts.error,
    filteredCounts.info,
    filteredCounts.warn,
    filteredEntries.length,
    latestVisibleIssue,
    query,
    recentWindowOnly,
    sortOrder,
    t.logs.copyFailed,
    t.logs.visibleSliceCopied,
    visibleIssueTrend.last15m,
    visibleIssueTrend.last60m,
  ]);

  const handleFocusRepeatedRecentIssue = useCallback((messageText: string) => {
    if (!messageText) return;

    setFilter('issues');
    setRecentWindowOnly(true);
    setQuery(messageText);
    void message.success(t.logs.focusRepeatedRecentIssueApplied);
  }, [t.logs.focusRepeatedRecentIssueApplied]);

  const handleCopyRepeatedRecentIssues = useCallback(async () => {
    const lines = [
      'Pro5 repeated recent issues',
      ...repeatedRecentIssues.map((issue) => `${issue.level.toUpperCase()} | ${issue.count}x | ${issue.message}`),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      void message.success(t.logs.repeatedRecentIssuesCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [repeatedRecentIssues, t.logs.copyFailed, t.logs.repeatedRecentIssuesCopied]);

  const handleResetViewState = useCallback(() => {
    setFilter('all');
    setQuery('');
    setRecentWindowOnly(false);
    setSortOrder('newest');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LOGS_VIEW_STORAGE_KEY);
    }
    void message.success(t.logs.viewStateReset);
  }, [t.logs.viewStateReset]);

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; label: string; onClose: () => void }> = [];

    if (filter === 'issues') {
      tags.push({
        key: 'issues',
        label: t.logs.issuesOnly,
        onClose: () => setFilter('all'),
      });
    } else if (filter !== 'all') {
      const levelLabel = filter === 'info'
        ? t.logs.filterInfo
        : filter === 'warn'
          ? t.logs.filterWarn
          : t.logs.filterError;

      tags.push({
        key: 'level',
        label: `${t.logs.levelFilterLabel}: ${levelLabel}`,
        onClose: () => setFilter('all'),
      });
    }

    if (recentWindowOnly) {
      tags.push({
        key: 'recent-window',
        label: t.logs.recentWindowOnly,
        onClose: () => setRecentWindowOnly(false),
      });
    }

    if (query.trim()) {
      tags.push({
        key: 'query',
        label: `${t.logs.searchFilterLabel}: ${query.trim()}`,
        onClose: () => setQuery(''),
      });
    }

    return tags;
  }, [filter, query, recentWindowOnly, t.logs.filterError, t.logs.filterInfo, t.logs.filterWarn, t.logs.issuesOnly, t.logs.levelFilterLabel, t.logs.recentWindowOnly, t.logs.searchFilterLabel]);

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Title level={3} style={{ margin: 0 }}>{t.logs.title}</Typography.Title>
            <Typography.Text type="secondary">{t.logs.subtitle}</Typography.Text>
            <Space wrap>
              <Button onClick={() => navigate('/dashboard')}>
                {t.logs.openDashboard}
              </Button>
              <Select
                value={filter}
                style={{ minWidth: 180 }}
                onChange={(value) => setFilter(value)}
                options={[
                  { label: t.logs.filterAll, value: 'all' },
                  { label: t.logs.issuesOnly, value: 'issues' },
                  { label: t.logs.filterInfo, value: 'info' },
                  { label: t.logs.filterWarn, value: 'warn' },
                  { label: t.logs.filterError, value: 'error' },
                ]}
              />
              <Input.Search
                allowClear
                style={{ minWidth: 280 }}
                placeholder={t.logs.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { void loadLogs(); }}>
                {t.logs.refresh}
              </Button>
              <Button icon={<CopyOutlined />} disabled={!filteredEntries.length} onClick={() => { void handleCopyVisibleLogs(); }}>
                {t.logs.copyVisible}
              </Button>
              <Button disabled={!filteredEntries.length} onClick={handleExportVisibleLogs}>
                {t.logs.exportVisible}
              </Button>
              <Button disabled={!issueEntries.length} onClick={() => { void handleCopyIssues(); }}>
                {t.logs.copyIssues}
              </Button>
              <Button onClick={() => { void handleCopyIssueDigest(); }}>
                {t.logs.copyDigest}
              </Button>
              <Button onClick={() => setFilter('issues')}>
                {t.logs.issuesOnly}
              </Button>
              <Button onClick={handleRecentIssuesPreset}>
                {t.logs.recentIssuesPreset}
              </Button>
              <Button disabled={!recentIssueEntries.length} onClick={() => { void handleCopyRecentIssueDigest(); }}>
                {t.logs.copyRecentIssueDigest}
              </Button>
              <Select
                value={sortOrder}
                style={{ minWidth: 180 }}
                onChange={(value) => setSortOrder(value)}
                options={[
                  { label: t.logs.sortNewest, value: 'newest' },
                  { label: t.logs.sortOldest, value: 'oldest' },
                ]}
              />
              <Button type={recentWindowOnly ? 'primary' : 'default'} onClick={() => setRecentWindowOnly((value) => !value)}>
                {t.logs.recentWindowOnly}
              </Button>
              <Space size={6}>
                <Typography.Text type="secondary">{t.logs.autoRefresh}</Typography.Text>
                <Switch checked={autoRefresh} onChange={setAutoRefresh} />
              </Space>
              <Button onClick={() => { void handleRunSelfTest(); }}>
                {t.logs.runSelfTest}
              </Button>
              <Button onClick={handleResetFilters}>
                {t.logs.resetFilters}
              </Button>
              <Button onClick={handleResetViewState}>
                {t.logs.resetViewState}
              </Button>
            </Space>
            <Typography.Text type="secondary">
              {`${t.logs.showing}: ${filteredEntries.length}/${entries.length}${recentWindowOnly ? ` · ${t.logs.recentWindowOnlyActive}` : ''}`}
            </Typography.Text>
            <Typography.Text type="secondary">
              {`${t.logs.lastRefreshed}: ${formatTimestamp(lastRefreshedAt)}${autoRefresh ? ` · ${t.logs.autoRefreshOn}` : ''}`}
            </Typography.Text>
            {activeFilterTags.length ? (
              <Space wrap size={[8, 8]}>
                <Typography.Text type="secondary">{t.logs.activeFilters}</Typography.Text>
                {activeFilterTags.map((tag) => (
                  <Tag
                    key={tag.key}
                    closable
                    onClose={(event) => {
                      event.preventDefault();
                      tag.onClose();
                    }}
                  >
                    {tag.label}
                  </Tag>
                ))}
              </Space>
            ) : null}
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card hoverable onClick={() => setFilter('info')}>
              <Statistic title={t.logs.filterInfo} value={counts.info} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card hoverable onClick={() => setFilter('warn')}>
              <Statistic title={t.logs.filterWarn} value={counts.warn} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card hoverable onClick={() => setFilter('error')}>
              <Statistic title={t.logs.filterError} value={counts.error} />
            </Card>
          </Col>
        </Row>

        {(query.trim() || filter !== 'all' || recentWindowOnly) ? (
          <Alert
            type={(filteredCounts.error || filteredCounts.warn) ? 'warning' : 'info'}
            showIcon
            message={t.logs.visibleBreakdown}
            description={`${filteredEntries.length} ${t.logs.visibleEntries} · ${filteredCounts.error} ${t.logs.filterError.toLowerCase()} · ${filteredCounts.warn} ${t.logs.filterWarn.toLowerCase()} · ${filteredCounts.info} ${t.logs.filterInfo.toLowerCase()}`}
            action={(
              <Button size="small" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSliceSummary(); }}>
                {t.logs.copyVisibleSlice}
              </Button>
            )}
          />
        ) : null}

        {(query.trim() || filter !== 'all' || recentWindowOnly) && (visibleIssueTrend.last15m || visibleIssueTrend.last60m) ? (
          <Alert
            type={visibleTrendStatus.tone}
            showIcon
            message={`${t.logs.visibleTrendTitle}: ${visibleTrendStatus.label}`}
            description={`${t.logs.visibleTrendLast15.replace('{count}', String(visibleIssueTrend.last15m))} · ${t.logs.visibleTrendLast60.replace('{count}', String(visibleIssueTrend.last60m))}`}
          />
        ) : null}

        {(query.trim() || filter !== 'all' || recentWindowOnly) && latestVisibleIssue ? (
          <Card
            size="small"
            title={t.logs.visibleLatestIssue}
            extra={(
              <Space size={4}>
                <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleIssue(); }}>
                  {t.logs.copyVisibleIssue}
                </Button>
                <Button type="link" onClick={handleFocusVisibleIssue}>
                  {t.logs.focusVisibleIssue}
                </Button>
              </Space>
            )}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={latestVisibleIssue.level === 'error' ? 'red' : 'gold'}>
                  {latestVisibleIssue.level.toUpperCase()}
                </Tag>
                <Typography.Text type="secondary">{formatTimestamp(latestVisibleIssue.timestamp)}</Typography.Text>
                <Typography.Text type="secondary">
                  {formatRelativeTime(latestVisibleIssue.timestamp, {
                    justNow: t.logs.justNow,
                    minutesAgo: (count) => t.logs.minutesAgo.replace('{count}', String(count)),
                    hoursAgo: (count) => t.logs.hoursAgo.replace('{count}', String(count)),
                    daysAgo: (count) => t.logs.daysAgo.replace('{count}', String(count)),
                  })}
                </Typography.Text>
              </Space>
              <Alert
                type={latestVisibleIssue.level === 'error' ? 'error' : 'warning'}
                showIcon
                message={latestVisibleIssue.message}
              />
            </Space>
          </Card>
        ) : null}

        {repeatedRecentIssue ? (
          <Alert
            type={repeatedRecentIssue.level === 'error' ? 'error' : 'warning'}
            showIcon
            message={t.logs.repeatedRecentIssueTitle}
            description={`${repeatedRecentIssue.message} · ${t.logs.repeatedRecentIssueCount.replace('{count}', String(repeatedRecentIssue.count))}`}
            action={(
              <Button size="small" onClick={() => handleFocusRepeatedRecentIssue(repeatedRecentIssue.message)}>
                {t.logs.focusRepeatedRecentIssue}
              </Button>
            )}
          />
        ) : null}

        {repeatedRecentIssues.length > 1 ? (
          <Card
            title={t.logs.topRepeatedRecentIssues}
            size="small"
            extra={(
              <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyRepeatedRecentIssues(); }}>
                {t.logs.copyRepeatedRecentIssues}
              </Button>
            )}
          >
            <List
              size="small"
              dataSource={repeatedRecentIssues}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button key={`focus-${item.message}`} type="link" onClick={() => handleFocusRepeatedRecentIssue(item.message)}>
                      {t.logs.focusRepeatedRecentIssue}
                    </Button>,
                  ]}
                >
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Space wrap>
                      <Tag color={item.level === 'error' ? 'red' : 'gold'}>
                        {item.level.toUpperCase()}
                      </Tag>
                      <Typography.Text strong>{item.message}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary">
                      {t.logs.repeatedRecentIssueCount.replace('{count}', String(item.count))}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        ) : null}

        {latestIssue ? (
          <Card
            title={t.logs.latestIssue}
            extra={(
              <Space size={4}>
                <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyLatestIssue(); }}>
                  {t.logs.copyLatestIssue}
                </Button>
                <Button type="link" onClick={handleFocusLatestIssue}>
                  {t.logs.focusLatestIssue}
                </Button>
                <Button type="link" onClick={() => setFilter('issues')}>
                  {t.logs.issuesOnly}
                </Button>
              </Space>
            )}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={latestIssue.level === 'error' ? 'red' : 'gold'}>
                  {latestIssue.level.toUpperCase()}
                </Tag>
                {issueStreak > 1 ? (
                  <Tag color="volcano">
                    {t.logs.issueStreak.replace('{count}', String(issueStreak))}
                  </Tag>
                ) : null}
                {recentIssueCount ? (
                  <Tag color="magenta">
                    {t.logs.recentIssueWindow.replace('{count}', String(recentIssueCount))}
                  </Tag>
                ) : null}
                {recentIssueBreakdown.error ? (
                  <Tag color="red">
                    {t.logs.recentErrors.replace('{count}', String(recentIssueBreakdown.error))}
                  </Tag>
                ) : null}
                {recentIssueBreakdown.warn ? (
                  <Tag color="gold">
                    {t.logs.recentWarnings.replace('{count}', String(recentIssueBreakdown.warn))}
                  </Tag>
                ) : null}
                <Typography.Text type="secondary">{formatTimestamp(latestIssue.timestamp)}</Typography.Text>
                <Typography.Text type="secondary">
                  {formatRelativeTime(latestIssue.timestamp, {
                    justNow: t.logs.justNow,
                    minutesAgo: (count) => t.logs.minutesAgo.replace('{count}', String(count)),
                    hoursAgo: (count) => t.logs.hoursAgo.replace('{count}', String(count)),
                    daysAgo: (count) => t.logs.daysAgo.replace('{count}', String(count)),
                  })}
                </Typography.Text>
              </Space>
              <Alert
                type={latestIssue.level === 'error' ? 'error' : 'warning'}
                showIcon
                message={latestIssue.message}
              />
            </Space>
          </Card>
        ) : null}

        {!latestIssue && entries.length ? (
          <Alert
            type="success"
            showIcon
            message={t.logs.allClear}
            description={t.logs.allClearHint}
          />
        ) : null}

        {(counts.warn || counts.error) ? (
          <Alert
            type={counts.error ? 'error' : 'warning'}
            showIcon
            message={`${t.logs.incidentSummary}: ${counts.error} ${t.logs.filterError.toLowerCase()} · ${counts.warn} ${t.logs.filterWarn.toLowerCase()}`}
            description={`${t.logs.incidentHint}${issueStreak > 1 ? ` ${t.logs.incidentStreakHint.replace('{count}', String(issueStreak))}` : ''}${recentIssueCount ? ` ${t.logs.recentIssueWindowHint.replace('{count}', String(recentIssueCount))}` : ''}`}
            action={(
              <Space wrap>
                {recentIssueBreakdown.error ? (
                  <Tag color="red">
                    {t.logs.recentErrors.replace('{count}', String(recentIssueBreakdown.error))}
                  </Tag>
                ) : null}
                {recentIssueBreakdown.warn ? (
                  <Tag color="gold">
                    {t.logs.recentWarnings.replace('{count}', String(recentIssueBreakdown.warn))}
                  </Tag>
                ) : null}
                <Button size="small" onClick={() => window.open('http://127.0.0.1:3210/api/support/diagnostics', '_blank')}>
                  {t.logs.exportDiagnostics}
                </Button>
                <Button size="small" onClick={() => navigate('/settings')}>
                  {t.logs.openSettings}
                </Button>
                <Button size="small" onClick={() => { void handleRunSelfTest(); }}>
                  {t.logs.runSelfTest}
                </Button>
              </Space>
            )}
          />
        ) : null}

        {entries.length ? (
          <Card>
            {filteredEntries.length ? (
              <List
                dataSource={filteredEntries}
                renderItem={(entry) => (
                  <List.Item
                    actions={[
                      <Button key="copy-line" type="link" icon={<CopyOutlined />} onClick={() => { void handleCopySingleLog(entry.raw); }}>
                        {t.logs.copyLine}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={(
                        <Space wrap>
                          <Tag color={entry.level === 'error' ? 'red' : entry.level === 'warn' ? 'gold' : 'blue'}>
                            {entry.level.toUpperCase()}
                          </Tag>
                          <Typography.Text type="secondary">{formatTimestamp(entry.timestamp)}</Typography.Text>
                          <Typography.Text type="secondary">
                            {formatRelativeTime(entry.timestamp, {
                              justNow: t.logs.justNow,
                              minutesAgo: (count) => t.logs.minutesAgo.replace('{count}', String(count)),
                              hoursAgo: (count) => t.logs.hoursAgo.replace('{count}', String(count)),
                              daysAgo: (count) => t.logs.daysAgo.replace('{count}', String(count)),
                            })}
                          </Typography.Text>
                        </Space>
                      )}
                      description={(
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          {entry.level === 'error' ? (
                            <Alert type="error" showIcon message={entry.message} />
                          ) : entry.level === 'warn' ? (
                            <Alert type="warning" showIcon message={entry.message} />
                          ) : (
                            <Typography.Text>{entry.message}</Typography.Text>
                          )}
                          <Typography.Text type="secondary" style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>
                            {entry.raw}
                          </Typography.Text>
                        </Space>
                      )}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                description={t.logs.noMatch}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Space wrap>
                  <Button onClick={handleRecentIssuesPreset}>
                    {t.logs.recentIssuesPreset}
                  </Button>
                  <Button onClick={handleResetFilters}>
                    {t.logs.resetFilters}
                  </Button>
                  <Button onClick={() => navigate('/dashboard')}>
                    {t.logs.openDashboard}
                  </Button>
                </Space>
              </Empty>
            )}
          </Card>
        ) : (
          <Alert type="info" message={t.logs.noLogs} showIcon />
        )}

        {!entries.length && !loading ? (
          <Empty description={t.logs.noLogs} />
        ) : null}
      </Space>
    </div>
  );
};

export default Logs;
