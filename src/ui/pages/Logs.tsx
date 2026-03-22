import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, List, Select, Space, Tag, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
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

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [query, setQuery] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<string[]>('/api/logs');
    setLoading(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setEntries(res.data.slice().reverse().map(parseLogEntry));
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const levelMatches = filter === 'all' || entry.level === filter;
      const queryMatches = !normalizedQuery || entry.raw.toLowerCase().includes(normalizedQuery);
      return levelMatches && queryMatches;
    });
  }, [entries, filter, query]);

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Title level={3} style={{ margin: 0 }}>{t.logs.title}</Typography.Title>
            <Typography.Text type="secondary">{t.logs.subtitle}</Typography.Text>
            <Space wrap>
              <Select
                value={filter}
                style={{ minWidth: 180 }}
                onChange={(value) => setFilter(value)}
                options={[
                  { label: t.logs.filterAll, value: 'all' },
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
            </Space>
            <Typography.Text type="secondary">
              {`${t.logs.showing}: ${filteredEntries.length}/${entries.length}`}
            </Typography.Text>
          </Space>
        </Card>

        {entries.length ? (
          <Card>
            <List
              dataSource={filteredEntries}
              locale={{ emptyText: t.logs.noMatch }}
              renderItem={(entry) => (
                <List.Item>
                  <List.Item.Meta
                    title={(
                      <Space wrap>
                        <Tag color={entry.level === 'error' ? 'red' : entry.level === 'warn' ? 'gold' : 'blue'}>
                          {entry.level.toUpperCase()}
                        </Tag>
                        <Typography.Text type="secondary">{formatTimestamp(entry.timestamp)}</Typography.Text>
                      </Space>
                    )}
                    description={(
                      <Space direction="vertical" size={2}>
                        <Typography.Text>{entry.message}</Typography.Text>
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
