import React from 'react';
import { Alert, Button, Card, List, Space, Tag, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { type LogsState } from '../useLogsState';

export const LogSourcePanel: React.FC<{ state: LogsState }> = ({ state }) => {
  const {
    t, filter, query, recentWindowOnly, visibleTopSource, visibleSources, visibleTopSourceShare,
    visibleTopSourcesConcentration, visibleSourceMode, visibleSourceActionHint, visibleTopSourceTimestamp,
    visibleTopSourceTrend, visibleSourceActionButtonLabel, visibleTopSourceFreshness,
    handleCopyVisibleSources, handleCopyVisibleSourceDigest, handleFocusVisibleSource,
    handleOpenVisibleSourceLatest, handleCopyVisibleSourceLatest, handleCopyVisibleTopSourceSummary
  } = state;

  const isFiltering = query.trim() || filter !== 'all' || recentWindowOnly;

  if (!isFiltering || !visibleTopSource) return null;

  return (
    <Card
      size="small"
      title={t.logs.visibleSourcesTitle}
      extra={(
        <Space size={4}>
          <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSources(); }}>
            {t.logs.copyVisibleSources}
          </Button>
          <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSourceDigest(visibleTopSource); }}>
            {t.logs.copyVisibleSourceDigest}
          </Button>
        </Space>
      )}
    >
      <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
        <Tag color="blue">{`${t.logs.visibleTopSourceShareLabel}: ${visibleTopSourceShare}%`}</Tag>
        <Tag color="purple">{`${t.logs.visibleTopSourcesConcentrationLabel}: ${visibleTopSourcesConcentration}%`}</Tag>
        <Tag color="geekblue">{`${t.logs.visibleSourceModeLabel}: ${visibleSourceMode.label}`}</Tag>
      </Space>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {`${t.logs.visibleSourceModeHintLabel}: ${visibleSourceMode.hint}`}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {`${t.logs.visibleSourceActionHintLabel}: ${visibleSourceActionHint}`}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {`${t.logs.visibleTopSourceTimestampLabel}: ${visibleTopSourceTimestamp}`}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {`${t.logs.visibleTopSourceTrendLabel}: ${visibleTopSourceTrend.label} · ${t.logs.visibleTrendLast15.replace('{count}', String(visibleTopSourceTrend.last15m))} · ${t.logs.visibleTrendLast60.replace('{count}', String(visibleTopSourceTrend.last60m))}`}
      </Typography.Text>
      <Button
        size="small"
        style={{ marginBottom: 12 }}
        onClick={() => {
          if (visibleTopSource.latestEntry.level === 'error' || visibleTopSourceShare >= 60) {
            handleFocusVisibleSource(visibleTopSource.source);
            return;
          }
          if (visibleSourceMode.label === t.logs.visibleSourceModeMixed) {
            handleOpenVisibleSourceLatest(visibleTopSource.latestEntry);
            return;
          }
          handleFocusVisibleSource(visibleTopSource.source);
        }}
      >
        {visibleSourceActionButtonLabel}
      </Button>
      <Typography.Text style={{ display: 'block', marginBottom: 8 }}>
        {visibleTopSource.latestEntry.message}
      </Typography.Text>
      <Alert
        style={{ marginBottom: 12 }}
        type={visibleTopSource.latestEntry.level === 'error' ? 'error' : visibleTopSource.latestEntry.level === 'warn' ? 'warning' : 'info'}
        showIcon
        message={`${t.logs.visibleTopSourceLatestLabel}: ${visibleTopSource.source}`}
        description={`${t.logs.visibleTopSourceFreshnessLabel}: ${visibleTopSourceFreshness} · ${t.logs.visibleTopSourceLatestLevelLabel}: ${visibleTopSource.latestEntry.level.toUpperCase()}`}
        action={(
          <Space size={4}>
            <Button size="small" type="link" onClick={() => handleFocusVisibleSource(visibleTopSource.source)}>
              {t.logs.focusVisibleSource}
            </Button>
            <Button size="small" type="link" onClick={() => handleOpenVisibleSourceLatest(visibleTopSource.latestEntry)}>
              {t.logs.openVisibleSourceLatest}
            </Button>
            <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSourceLatest(visibleTopSource); }}>
              {t.logs.copyVisibleSourceLatest}
            </Button>
            <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleTopSourceSummary(); }}>
              {t.logs.copyVisibleTopSourceSummary}
            </Button>
            <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSourceDigest(visibleTopSource); }}>
              {t.logs.copyVisibleSourceDigest}
            </Button>
          </Space>
        )}
      />
      <List
        size="small"
        dataSource={visibleSources}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key={`focus-visible-source-${item.source}`} type="link" onClick={() => handleFocusVisibleSource(item.source)}>
                {t.logs.focusVisibleSource}
              </Button>,
              <Button key={`open-visible-source-${item.source}`} type="link" onClick={() => handleOpenVisibleSourceLatest(item.latestEntry)}>
                {t.logs.openVisibleSourceLatest}
              </Button>,
              <Button key={`copy-visible-source-latest-${item.source}`} type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSourceLatest(item); }}>
                {t.logs.copyVisibleSourceLatest}
              </Button>,
              <Button key={`copy-visible-source-${item.source}`} type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyVisibleSourceDigest(item); }}>
                {t.logs.copyVisibleSourceDigest}
              </Button>,
            ]}
          >
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {item.source === visibleTopSource?.source ? (
                <Space wrap>
                  <Tag color="blue">{`${t.logs.visibleTopSourceShareLabel}: ${visibleTopSourceShare}%`}</Tag>
                  <Tag color="purple">{`${t.logs.visibleTopSourcesConcentrationLabel}: ${visibleTopSourcesConcentration}%`}</Tag>
                  <Tag color="geekblue">{`${t.logs.visibleSourceModeLabel}: ${visibleSourceMode.label}`}</Tag>
                  <Tag color={item.latestEntry.level === 'error' ? 'red' : item.latestEntry.level === 'warn' ? 'gold' : 'blue'}>
                    {`${t.logs.visibleTopSourceLatestLevelLabel}: ${item.latestEntry.level.toUpperCase()}`}
                  </Tag>
                  <Tag>{`${t.logs.visibleTopSourceFreshnessLabel}: ${visibleTopSourceFreshness}`}</Tag>
                </Space>
              ) : null}
              <Space wrap>
                <Typography.Text strong>{item.source}</Typography.Text>
                <Tag>{t.logs.visibleSourceCount.replace('{count}', String(item.count))}</Tag>
                <Tag color={item.latestEntry.level === 'error' ? 'red' : item.latestEntry.level === 'warn' ? 'gold' : 'blue'}>
                  {item.latestEntry.level.toUpperCase()}
                </Tag>
              </Space>
              <Typography.Text type="secondary">
                {item.latestEntry.message}
              </Typography.Text>
              {item.source === visibleTopSource?.source ? (
                <Typography.Text type="secondary">
                  {`${t.logs.visibleSourceModeHintLabel}: ${visibleSourceMode.hint}`}
                </Typography.Text>
              ) : null}
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
};
