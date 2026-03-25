import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { apiClient } from '../../api/client';
import { useTranslation } from '../../shared/hooks/useTranslation';

interface ProxyRecord {
  id: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  lastCheckAt?: string;
  lastCheckStatus?: 'healthy' | 'failing';
  lastCheckIp?: string;
  lastCheckTimezone?: string | null;
  lastCheckError?: string;
}

interface ProxyTestResult {
  ip: string;
  timezone?: string | null;
}

interface CreateProxyValues {
  type: ProxyRecord['type'];
  host: string;
  port: number;
  username?: string;
  password?: string;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

function getLocaleTag(language: string): string {
  return language === 'vi' ? 'vi-VN' : 'en-US';
}

const ProxiesPage: React.FC = () => {
  const { t, lang, format } = useTranslation();
  const [form] = Form.useForm<CreateProxyValues>();
  const [proxies, setProxies] = useState<ProxyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [defaultType, setDefaultType] = useState<ProxyRecord['type']>('http');
  const [testingIds, setTestingIds] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTesting, setBulkTesting] = useState(false);

  const fetchProxies = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<ProxyRecord[]>('/api/proxies');
    if (res.success) {
      setProxies(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchProxies();
  }, [fetchProxies]);

  async function handleCreate(): Promise<void> {
    const values = await form.validateFields().catch(() => null);
    if (!values) {
      return;
    }

    setCreating(true);
    const res = await apiClient.post<ProxyRecord>('/api/proxies', {
      ...values,
      port: Number(values.port),
    });
    setCreating(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    form.resetFields();
    setCreateOpen(false);
    void message.success(t.common.success);
    void fetchProxies();
  }

  async function handleBulkImport(): Promise<void> {
    if (!importText.trim()) {
      return;
    }

    setImporting(true);
    const res = await apiClient.post<{ created: ProxyRecord[]; skipped: number }>('/api/proxies/import-bulk', {
      text: importText,
      defaultType,
    });
    setImporting(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    void message.success(format(t.proxy.importResult, {
      created: res.data.created.length,
      skipped: res.data.skipped,
    }));
    setImportText('');
    void fetchProxies();
  }

  async function handleDelete(id: string): Promise<void> {
    const res = await apiClient.delete(`/api/proxies/${id}`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setProxies((current) => current.filter((proxy) => proxy.id !== id));
  }

  async function handleTest(id: string): Promise<void> {
    setTestingIds((current) => ({ ...current, [id]: true }));
    const res = await apiClient.post<ProxyTestResult>(`/api/proxies/${id}/test`);
    setTestingIds((current) => ({ ...current, [id]: false }));

    if (!res.success) {
      void fetchProxies();
      return;
    }

    void fetchProxies();
  }

  async function handleBulkTest(ids?: string[]): Promise<void> {
    const targetIds = ids?.length ? ids : selectedIds;
    if (!targetIds.length) {
      return;
    }

    setBulkTesting(true);
    const nextTesting = { ...testingIds };
    targetIds.forEach((id) => { nextTesting[id] = true; });
    setTestingIds(nextTesting);

    const res = await apiClient.post<{
      total: number;
      healthy: number;
      failing: number;
    }>('/api/proxies/test-bulk', { ids: targetIds });

    setBulkTesting(false);
    setTestingIds((current) => {
      const cleared = { ...current };
      targetIds.forEach((id) => { delete cleared[id]; });
      return cleared;
    });

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    void message.success(format(t.proxy.bulkTestResult, {
      total: res.data.total,
      healthy: res.data.healthy,
      failing: res.data.failing,
    }));
    void fetchProxies();
  }

  const authenticatedCount = proxies.filter((proxy) => Boolean(proxy.username)).length;
  const socksCount = proxies.filter((proxy) => proxy.type === 'socks4' || proxy.type === 'socks5').length;
  const healthyCount = proxies.filter((proxy) => proxy.lastCheckStatus === 'healthy').length;
  const failingCount = proxies.filter((proxy) => proxy.lastCheckStatus === 'failing').length;

  const columns: ColumnsType<ProxyRecord> = [
    {
      title: t.proxy.type,
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (type: ProxyRecord['type']) => <Tag color="blue">{type.toUpperCase()}</Tag>,
    },
    {
      title: t.proxy.host,
      dataIndex: 'host',
      key: 'host',
      render: (host: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{host}</Typography.Text>
          <Typography.Text type="secondary">:{record.port}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t.proxy.credentials,
      key: 'credentials',
      width: 170,
      render: (_, record) => (
        record.username
          ? <Badge status="processing" text={record.username} />
          : <Typography.Text type="secondary">{t.proxy.noCredentials}</Typography.Text>
      ),
    },
    {
      title: t.proxy.lastCheck,
      key: 'lastCheck',
      render: (_, record) => {
        if (!record.lastCheckAt || !record.lastCheckStatus) {
          return <Typography.Text type="secondary">{t.proxy.neverChecked}</Typography.Text>;
        }

        const summary = record.lastCheckStatus === 'healthy'
          ? (
            record.lastCheckTimezone
              ? format(t.proxy.testSuccessWithTimezone, {
                ip: record.lastCheckIp ?? '—',
                timezone: record.lastCheckTimezone,
              })
              : format(t.proxy.testSuccess, { ip: record.lastCheckIp ?? '—' })
          )
          : (record.lastCheckError ?? t.proxy.testFailed);

        return (
          <Space direction="vertical" size={0}>
            <Tag color={record.lastCheckStatus === 'healthy' ? 'green' : 'red'}>{summary}</Tag>
            <Typography.Text type="secondary">
              {new Date(record.lastCheckAt).toLocaleString(getLocaleTag(lang))}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: t.common.actions,
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            type="primary"
            loading={Boolean(testingIds[record.id])}
            onClick={() => void handleTest(record.id)}
          >
            {t.proxy.test}
          </Button>
          <Popconfirm
            title={t.proxy.deleteConfirm}
            onConfirm={() => void handleDelete(record.id)}
            okText={t.common.yes}
            cancelText={t.common.no}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card style={{ ...cardStyle, background: 'linear-gradient(135deg, #f8fafc 0%, #ecfeff 100%)' }} bordered={false}>
            <Row gutter={[24, 24]} align="middle">
              <Col flex="auto">
                <Typography.Title level={3} style={{ marginBottom: 8 }}>
                  {t.proxy.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                  {t.proxy.subtitle}
                </Typography.Paragraph>
              </Col>
              <Col>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={() => void fetchProxies()} />
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    {t.proxy.newProxy}
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.proxy.total} value={proxies.length} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.proxy.authenticated} value={authenticatedCount} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.proxy.socks} value={socksCount} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.proxy.healthy} value={healthyCount} valueStyle={{ color: '#389e0d' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.proxy.needsCheck} value={failingCount} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title={t.proxy.importBulk} style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Select
                value={defaultType}
                onChange={(value) => setDefaultType(value)}
                options={[
                  { label: 'HTTP', value: 'http' },
                  { label: 'HTTPS', value: 'https' },
                  { label: 'SOCKS4', value: 'socks4' },
                  { label: 'SOCKS5', value: 'socks5' },
                ]}
              />
              <Input.TextArea
                rows={10}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={t.proxy.importPlaceholder}
              />
              <Button type="primary" loading={importing} onClick={() => void handleBulkImport()}>
                {t.proxy.importAction}
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card style={cardStyle}>
            {selectedIds.length > 0 ? (
              <Space wrap style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary">
                  {format(t.proxy.selectedCount, { count: selectedIds.length })}
                </Typography.Text>
                <Button
                  type="primary"
                  loading={bulkTesting}
                  onClick={() => void handleBulkTest()}
                >
                  {t.proxy.testSelected}
                </Button>
              </Space>
            ) : null}
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={proxies}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
              }}
              locale={{
                emptyText: t.proxy.noProxies,
              }}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={t.proxy.newProxy}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        okText={t.common.save}
        cancelText={t.common.cancel}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'http' }}>
          <Form.Item name="type" label={t.proxy.type} rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'HTTP', value: 'http' },
                { label: 'HTTPS', value: 'https' },
                { label: 'SOCKS4', value: 'socks4' },
                { label: 'SOCKS5', value: 'socks5' },
              ]}
            />
          </Form.Item>
          <Form.Item name="host" label={t.proxy.host} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="port" label={t.proxy.port} rules={[{ required: true }]}>
            <Input type="number" min={1} max={65535} />
          </Form.Item>
          <Form.Item name="username" label={t.proxy.credentials}>
            <Input placeholder={t.proxy.usernamePlaceholder} />
          </Form.Item>
          <Form.Item name="password" label={t.proxy.password}>
            <Input.Password aria-label="Password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProxiesPage;
