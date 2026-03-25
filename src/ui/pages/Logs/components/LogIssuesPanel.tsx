import React from 'react';
import { Alert, Button, Card, List, Space, Tag, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { type LogsState } from '../useLogsState';

export const LogIssuesPanel: React.FC<{ state: LogsState }> = ({ state }) => {
  const {
    t, repeatedRecentIssue, repeatedRecentIssues, hottestRecentSource, repeatedRecentSources,
    handleFocusRepeatedRecentIssue, handleCopyRepeatedRecentIssues,
    handleFocusRecentIssueSource, handleOpenRecentIssueSourceLatest, handleCopyRecentIssueSourceLatest, handleCopyRecentIssueSourceDigest,
    handleCopyRecentIssueSources
  } = state;

  if (!repeatedRecentIssue && !hottestRecentSource) return null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
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

      {hottestRecentSource ? (
        <Alert
          type={hottestRecentSource.level === 'error' ? 'error' : 'warning'}
          showIcon
          message={t.logs.recentIssueSourceTitle}
          description={`${hottestRecentSource.source} · ${t.logs.recentIssueSourceCount.replace('{count}', String(hottestRecentSource.count))} · ${hottestRecentSource.latestEntry.message}`}
          action={(
            <Space size={4}>
              <Button size="small" onClick={() => handleFocusRecentIssueSource(hottestRecentSource.source)}>
                {t.logs.focusRecentIssueSource}
              </Button>
              <Button size="small" type="link" onClick={() => handleOpenRecentIssueSourceLatest(hottestRecentSource.latestEntry)}>
                {t.logs.openRecentIssueSourceLatest}
              </Button>
              <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyRecentIssueSourceLatest(hottestRecentSource.source, hottestRecentSource.latestEntry); }}>
                {t.logs.copyRecentIssueSourceLatest}
              </Button>
              <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyRecentIssueSourceDigest(hottestRecentSource); }}>
                {t.logs.copyRecentIssueSourceDigest}
              </Button>
            </Space>
          )}
        />
      ) : null}

      {repeatedRecentSources.length > 1 ? (
        <Card
          title={t.logs.topRecentIssueSources}
          size="small"
          extra={(
            <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyRecentIssueSources(); }}>
              {t.logs.copyRecentIssueSources}
            </Button>
          )}
        >
          <List
            size="small"
            dataSource={repeatedRecentSources}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key={`focus-${item.source}`} type="link" onClick={() => handleFocusRecentIssueSource(item.source)}>
                    {t.logs.focusRecentIssueSource}
                  </Button>,
                  <Button key={`open-latest-${item.source}`} type="link" onClick={() => handleOpenRecentIssueSourceLatest(item.latestEntry)}>
                    {t.logs.openRecentIssueSourceLatest}
                  </Button>,
                  <Button key={`copy-latest-${item.source}`} type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyRecentIssueSourceLatest(item.source, item.latestEntry); }}>
                    {t.logs.copyRecentIssueSourceLatest}
                  </Button>,
                  <Button key={`copy-digest-${item.source}`} type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyRecentIssueSourceDigest(item); }}>
                    {t.logs.copyRecentIssueSourceDigest}
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Space wrap>
                    <Typography.Text strong>{item.source}</Typography.Text>
                    <Tag color={item.level === 'error' ? 'red' : 'gold'}>
                      {item.level.toUpperCase()}
                    </Tag>
                  </Space>
                  <Typography.Text type="secondary">
                    {t.logs.recentIssueSourceCount.replace('{count}', String(item.count))}
                  </Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      ) : null}
    </Space>
  );
};
