import React, { useEffect, useMemo, useState } from 'react';
import { Select, Space, Button, Tag, Typography, message, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';

interface Proxy {
  id: string;
  label?: string;
  type: string;
  host: string;
  port: number;
  lastCheckAt?: string;
  lastCheckStatus?: 'healthy' | 'failing';
  lastCheckIp?: string;
  lastCheckTimezone?: string | null;
  lastCheckError?: string;
}

interface ProxySelectorProps {
  value?: string | null;
  onChange?: (proxyId: string | null) => void;
}

const ProxySelector: React.FC<ProxySelectorProps> = ({ value, onChange }) => {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [testing, setTesting] = useState(false);

  async function fetchProxies(): Promise<void> {
    const res = await apiClient.get<Proxy[]>('/api/proxies');
    if (res.success) setProxies(res.data);
  }

  useEffect(() => {
    void fetchProxies();
  }, []);

  async function handleTest(): Promise<void> {
    if (!value) return;
    setTesting(true);
    const res = await apiClient.post<{ ip: string }>(`/api/proxies/${value}/test`);
    setTesting(false);
    if (res.success) {
      void fetchProxies();
    } else {
      void fetchProxies();
      void message.error(`Test proxy thất bại: ${res.error}`);
    }
  }

  const selectedProxy = useMemo(
    () => proxies.find((proxy) => proxy.id === value) ?? null,
    [proxies, value],
  );

  const options = proxies.map((proxy) => {
    const hasHealthyStatus = proxy.lastCheckStatus === 'healthy';
    const hasFailingStatus = proxy.lastCheckStatus === 'failing';
    const checkBadge = hasHealthyStatus
      ? ' · OK'
      : hasFailingStatus
        ? ' · FAIL'
        : '';

    return {
      label: `[${proxy.type.toUpperCase()}] ${proxy.host}:${proxy.port}${proxy.label ? ` — ${proxy.label}` : ''}${checkBadge}`,
      value: proxy.id,
    };
  });

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space style={{ width: '100%' }}>
        <Select
          style={{ flex: 1, minWidth: 240 }}
          allowClear
          placeholder="Chọn proxy (để trống = không dùng proxy)"
          value={value ?? undefined}
          onChange={(v) => { onChange?.(v ?? null); }}
          options={options}
        />
        <Button
          disabled={!value}
          icon={testing ? <Spin indicator={<LoadingOutlined />} /> : <CheckCircleOutlined />}
          onClick={() => void handleTest()}
        >
          Test
        </Button>
      </Space>
      {selectedProxy?.lastCheckStatus === 'healthy' && selectedProxy.lastCheckAt ? (
        <Space direction="vertical" size={0}>
          <Tag color="green" icon={<CheckCircleOutlined />}>
            {selectedProxy.lastCheckTimezone
              ? `IP: ${selectedProxy.lastCheckIp ?? '—'} · ${selectedProxy.lastCheckTimezone}`
              : `IP: ${selectedProxy.lastCheckIp ?? '—'}`}
          </Tag>
          <Typography.Text type="secondary">
            Kiểm tra gần nhất: {new Date(selectedProxy.lastCheckAt).toLocaleString('vi-VN')}
          </Typography.Text>
        </Space>
      ) : null}
      {selectedProxy?.lastCheckStatus === 'failing' && selectedProxy.lastCheckAt ? (
        <Space direction="vertical" size={0}>
          <Tag color="red" icon={<CloseCircleOutlined />}>
            {selectedProxy.lastCheckError ?? 'Proxy không khả dụng'}
          </Tag>
          <Typography.Text type="secondary">
            Kiểm tra gần nhất: {new Date(selectedProxy.lastCheckAt).toLocaleString('vi-VN')}
          </Typography.Text>
        </Space>
      ) : null}
    </Space>
  );
};

export default ProxySelector;
