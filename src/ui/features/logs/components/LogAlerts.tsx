import React from 'react';
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { type LogsState } from '../useLogsState';

export const LogAlerts: React.FC<{ state: LogsState }> = ({ state }) => {
  const {
    t, filter, query, recentWindowOnly, filteredEntries, filteredCounts, visibleIssueRatio,
    visibleIssueTrend, visibleTrendStatus, latestVisibleIssue,
    handleCopyVisibleSliceSummary, handleCopyVisibleIssue, handleFocusVisibleIssue,
    formatTimestamp, formatRelativeTime
  } = state;

  const isFiltering = query.trim() || filter !== 'all' || recentWindowOnly;

  if (!isFiltering) return null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type={(filteredCounts.error || filteredCounts.warn) ? 'warning' : 'info'}
        showIcon
        message={t.logs.visibleBreakdown}
        description={`${filteredEntries.length} ${t.logs.visibleEntries}${query.trim() ? ` · ${t.logs.searchMatches.replace('{count}', String(filteredEntries.length))}` : ''} · ${t.logs.visibleIssueRatio.replace('{count}', String(visibleIssueRatio))} · ${filteredCounts.error} ${t.logs.filterError.toLowerCase()} · ${filteredCounts.warn} ${t.logs.filterWarn.toLowerCase()} · ${filteredCounts.debug} ${t.logs.filterDebug.toLowerCase()} · ${filteredCounts.info} ${t.logs.filterInfo.toLowerCase()}`}
        action={(
          <Button size="small" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSliceSummary(); }}>
            {t.logs.copyVisibleSlice}
          </Button>
        )}
      />

      {filteredEntries.length > 0 && filteredCounts.error === 0 && filteredCounts.warn === 0 ? (
        <Alert
          type="success"
          showIcon
          message={t.logs.visibleAllClear}
          description={t.logs.visibleAllClearHint}
        />
      ) : null}

      {(visibleIssueTrend.last15m || visibleIssueTrend.last60m) ? (
        <Alert
          type={visibleTrendStatus.tone}
          showIcon
          message={`${t.logs.visibleTrendTitle}: ${visibleTrendStatus.label}`}
          description={`${t.logs.visibleTrendLast15.replace('{count}', String(visibleIssueTrend.last15m))} · ${t.logs.visibleTrendLast60.replace('{count}', String(visibleIssueTrend.last60m))}`}
        />
      ) : null}

      {latestVisibleIssue ? (
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
                {formatRelativeTime(latestVisibleIssue.timestamp)}
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
    </Space>
  );
};
