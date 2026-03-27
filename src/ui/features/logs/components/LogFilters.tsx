import React from 'react';
import { Button, Input, Select, Space, Switch, Tag, Typography } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { type LogsState } from '../useLogsState';

export const LogFilters: React.FC<{ state: LogsState }> = ({ state }) => {
  const showDebugSurface = import.meta.env.DEV;
  const {
    t, loading, filter, query, sourceFilter, autoRefresh, recentWindowOnly, sortOrder, lastRefreshedAt,
    setFilter, setQuery, setSourceFilter, setAutoRefresh, setRecentWindowOnly, setSortOrder,
    filteredEntries, entries, sourceOptions, issueEntries, recentIssueEntries, activeFilterTags,
    loadLogs, handleCopyVisibleLogs, handleCopyIssues, handleCopyIssueDigest, handleCopyRecentIssueDigest,
    handleResetFilters, handleResetViewState, handleRecentIssuesPreset, formatTimestamp
  } = state;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap>
        <Select
          value={filter}
          style={{ minWidth: 180 }}
          onChange={(value) => setFilter(value)}
          options={[
            { label: t.logs.filterAll, value: 'all' },
            { label: t.logs.issuesOnly, value: 'issues' },
            ...(showDebugSurface ? [{ label: t.logs.filterDebug, value: 'debug' }] : []),
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
        <Button disabled={!filteredEntries.length} onClick={state.handleExportVisibleLogs}>
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
          allowClear
          showSearch
          value={sourceFilter || undefined}
          placeholder={t.logs.sourceFilterLabel}
          style={{ minWidth: 220 }}
          onChange={(value) => setSourceFilter(value ?? '')}
          options={sourceOptions}
          optionFilterProp="label"
        />
        <Select
          value={sortOrder}
          style={{ minWidth: 180 }}
          onChange={(value) => setSortOrder(value)}
          options={[
            { label: t.logs.sortNewest, value: 'newest' },
            { label: t.logs.sortOldest, value: 'oldest' },
          ]}
        />
        <Button type={recentWindowOnly ? 'primary' : 'default'} onClick={() => setRecentWindowOnly((value: boolean) => !value)}>
          {t.logs.recentWindowOnly}
        </Button>
        <Space size={6}>
          <Typography.Text type="secondary">{t.logs.autoRefresh}</Typography.Text>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} />
        </Space>
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
  );
};
