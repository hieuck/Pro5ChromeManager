import React, { useEffect, useState } from 'react';
import { Select, Space, Button, Tag, message, Spin } from 'antd';
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';

interface Proxy {
  id: string;
  label: string;
  type: string;
  host: string;
  port: number;
}

interface ProxySelectorProps {
  value?: string | null;
  onChange?: (proxyId: string | null) => void;
}

const ProxySelector: React.FC<ProxySelectorProps> = ({ value, onChange }) => {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    void apiClient.get<Proxy[]>('/api/proxies').then((res) => {
      if (res.success) setProxies(res.data);
    });
  }, []);

  async function handleTest(): Promise<void> {
    if (!value) return;
    setTesting(true);
    setTestResult(null);
    const res = await apiClient.post<{ ip: string }>(`/api/proxies/${value}/test`);
    setTesting(false);
    if (res.success) {
      setTestResult(res.data.ip);
    } else {
      void message.error(`Test proxy thất bại: ${res.error}`);
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space style={{ width: '100%' }}>
        <Select
          style={{ flex: 1, minWidth: 240 }}
          allowClear
          placeholder="Chọn proxy (để trống = không dùng proxy)"
          value={value ?? undefined}
          onChange={(v) => { onChange?.(v ?? null); setTestResult(null); }}
          options={proxies.map((p) => ({
            label: `[${p.type.toUpperCase()}] ${p.host}:${p.port}${p.label ? ` — ${p.label}` : ''}`,
            value: p.id,
          }))}
        />
        <Button
          disabled={!value}
          icon={testing ? <Spin indicator={<LoadingOutlined />} /> : <CheckCircleOutlined />}
          onClick={() => void handleTest()}
        >
          Test
        </Button>
      </Space>
      {testResult && (
        <Tag color="green" icon={<CheckCircleOutlined />}>
          IP: {testResult}
        </Tag>
      )}
    </Space>
  );
};

export default ProxySelector;
