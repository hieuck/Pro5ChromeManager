import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, List, Row, Select, Space, Statistic, Switch, Tag, Typography, message } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';

interface ParsedLogEntry {
  timestamp: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  raw: string;
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

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'issues' | 'info' | 'warn' | 'error'>('all');
  const [query, setQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
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

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const levelMatches = filter === 'all'
        || (filter === 'issues' ? entry.level === 'warn' || entry.level === 'error' : entry.level === filter);
      const queryMatches = !normalizedQuery || entry.raw.toLowerCase().includes(normalizedQuery);
      return levelMatches && queryMatches;
    });
  }, [entries, filter, query]);

  const counts = useMemo(() => ({
    info: entries.filter((entry) => entry.level === 'info').length,
    warn: entries.filter((entry) => entry.level === 'warn').length,
    error: entries.filter((entry) => entry.level === 'error').length,
  }), [entries]);

  const latestIssue = useMemo(
    () => entries.find((entry) => entry.level === 'warn' || entry.level === 'error') ?? null,
    [entries],
  );

  const handleCopyVisibleLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filteredEntries.map((entry) => entry.raw).join('\n'));
      void message.success(t.logs.copied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [filteredEntries, t.logs.copied, t.logs.copyFailed]);

  const issueEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.level === 'warn' || entry.level === 'error'),
    [filteredEntries],
  );

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
    void message.success(t.logs.filtersReset);
  }, [t.logs.filtersReset]);

  const handleCopyIssueDigest = useCallback(async () => {
    const digestLines = [
      'Pro5 log digest',
      `Visible entries: ${filteredEntries.length}/${entries.length}`,
      `Issues: ${issueEntries.length}`,
      `Errors: ${counts.error}`,
      `Warnings: ${counts.warn}`,
      `Active filter: ${filter}`,
      query.trim() ? `Search: ${query.trim()}` : 'Search: none',
      latestIssue
        ? `Latest issue: ${latestIssue.level.toUpperCase()} | ${latestIssue.timestamp ?? 'unknown'} | ${latestIssue.message}`
        : 'Latest issue: none',
    ];

    try {
      await navigator.clipboard.writeText(digestLines.join('\n'));
      void message.success(t.logs.digestCopied);
    } catch {
      void message.error(t.logs.copyFailed);
    }
  }, [counts.error, counts.warn, entries.length, filter, filteredEntries.length, issueEntries.length, latestIssue, query, t.logs.copyFailed, t.logs.digestCopied]);

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
            </Space>
            <Typography.Text type="secondary">
              {`${t.logs.showing}: ${filteredEntries.length}/${entries.length}`}
            </Typography.Text>
            <Typography.Text type="secondary">
              {`${t.logs.lastRefreshed}: ${formatTimestamp(lastRefreshedAt)}${autoRefresh ? ` · ${t.logs.autoRefreshOn}` : ''}`}
            </Typography.Text>
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

        {latestIssue ? (
          <Card
            title={t.logs.latestIssue}
            extra={<Button type="link" onClick={() => setFilter('issues')}>{t.logs.issuesOnly}</Button>}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={latestIssue.level === 'error' ? 'red' : 'gold'}>
                  {latestIssue.level.toUpperCase()}
                </Tag>
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
            description={t.logs.incidentHint}
            action={(
              <Space wrap>
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
            <List
              dataSource={filteredEntries}
              locale={{ emptyText: t.logs.noMatch }}
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
