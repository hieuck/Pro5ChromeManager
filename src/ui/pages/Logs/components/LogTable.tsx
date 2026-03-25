import React from 'react';
import { Button, List, Space, Tag, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { type LogsState } from '../useLogsState';

export const LogTable: React.FC<{ state: LogsState }> = ({ state }) => {
  const { t, filteredEntries, loading, highlightSearchMatch, formatTimestamp, formatRelativeTime, handleCopySingleLog } = state;

  return (
    <List
      loading={loading}
      dataSource={filteredEntries}
      pagination={{
        pageSize: 50,
        showSizeChanger: true,
        pageSizeOptions: ['20', '50', '100', '200', '500'],
      }}
      renderItem={(item) => (
        <List.Item
          key={item.raw}
          actions={[
            <Button
              key="copy"
              type="link"
              icon={<CopyOutlined />}
              onClick={() => { void handleCopySingleLog(item.raw); }}
            >
              {t.logs.copy}
            </Button>,
          ]}
        >
          <List.Item.Meta
            title={(
              <Space wrap>
                <Tag color={
                  item.level === 'error' ? 'red' :
                  item.level === 'warn' ? 'gold' :
                  item.level === 'debug' ? 'default' : 'blue'
                }>
                  {item.level.toUpperCase()}
                </Tag>
                {item.source && (
                  <Tag color="geekblue">{item.source}</Tag>
                )}
                <Typography.Text type="secondary">
                  {formatTimestamp(item.timestamp)}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {formatRelativeTime(item.timestamp)}
                </Typography.Text>
              </Space>
            )}
            description={(
              <div className="break-all-pre-wrap mt-8">
                {highlightSearchMatch(item.message)}
              </div>
            )}
          />
        </List.Item>
      )}
    />
  );
};
