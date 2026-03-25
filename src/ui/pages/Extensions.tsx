import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';

interface ExtensionRecord {
  id: string;
  name: string;
  sourcePath: string;
  entryPath: string;
  version: string | null;
  description: string | null;
  category: string | null;
  enabled: boolean;
  defaultForNewProfiles: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateExtensionValues {
  name?: string;
  category?: string;
  defaultForNewProfiles?: boolean;
  sourcePath: string;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

const Extensions: React.FC = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm<CreateExtensionValues>();
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});

  const fetchExtensions = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<ExtensionRecord[]>('/api/extensions');
    if (res.success) {
      setExtensions(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchExtensions();
  }, [fetchExtensions]);

  async function handleCreate(): Promise<void> {
    const values = await form.validateFields().catch(() => null);
    if (!values) {
      return;
    }

    setCreating(true);
    const res = await apiClient.post<ExtensionRecord>('/api/extensions', values);
    setCreating(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    form.resetFields();
    setCreateOpen(false);
    void message.success(t.extensions.created);
    void fetchExtensions();
  }

  async function handleToggle(record: ExtensionRecord, enabled: boolean): Promise<void> {
    setUpdatingIds((current) => ({ ...current, [record.id]: true }));
    const res = await apiClient.put<ExtensionRecord>(`/api/extensions/${record.id}`, { enabled });
    setUpdatingIds((current) => ({ ...current, [record.id]: false }));

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setExtensions((current) => current.map((extension) => (
      extension.id === record.id ? res.data : extension
    )));
  }

  async function handleToggleDefault(record: ExtensionRecord, defaultForNewProfiles: boolean): Promise<void> {
    setUpdatingIds((current) => ({ ...current, [record.id]: true }));
    const res = await apiClient.put<ExtensionRecord>(`/api/extensions/${record.id}`, { defaultForNewProfiles });
    setUpdatingIds((current) => ({ ...current, [record.id]: false }));

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setExtensions((current) => current.map((extension) => (
      extension.id === record.id ? res.data : extension
    )));
  }

  async function handleDelete(id: string): Promise<void> {
    const res = await apiClient.delete(`/api/extensions/${id}`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setExtensions((current) => current.filter((extension) => extension.id !== id));
  }

  const enabledCount = extensions.filter((extension) => extension.enabled).length;
  const defaultCount = extensions.filter((extension) => extension.defaultForNewProfiles).length;

  const columns: ColumnsType<ExtensionRecord> = [
    {
      title: t.common.name,
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          <Typography.Text type="secondary">
            {record.version ? `v${record.version}` : t.extensions.unknownVersion}
            {record.category ? ` · ${record.category}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t.extensions.path,
      key: 'path',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.entryPath}</Typography.Text>
          {record.description ? <Typography.Text type="secondary">{record.description}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: t.common.status,
      key: 'enabled',
      width: 150,
      render: (_, record) => (
        <Space>
          <Switch
            checked={record.enabled}
            loading={Boolean(updatingIds[record.id])}
            onChange={(enabled) => { void handleToggle(record, enabled); }}
          />
          <Badge status={record.enabled ? 'success' : 'default'} text={record.enabled ? t.extensions.enabled : t.extensions.disabled} />
        </Space>
      ),
    },
    {
      title: t.extensions.defaultAssignment,
      key: 'defaultForNewProfiles',
      width: 180,
      render: (_, record) => (
        <Space>
          <Switch
            checked={record.defaultForNewProfiles}
            disabled={!record.enabled}
            loading={Boolean(updatingIds[record.id])}
            onChange={(value) => { void handleToggleDefault(record, value); }}
          />
          <Badge
            status={record.defaultForNewProfiles ? 'processing' : 'default'}
            text={record.defaultForNewProfiles ? t.extensions.defaultForNewProfiles : t.extensions.optional}
          />
        </Space>
      ),
    },
    {
      title: t.common.actions,
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Popconfirm
          title={t.extensions.deleteConfirm}
          onConfirm={() => void handleDelete(record.id)}
          okText={t.common.delete}
          cancelText={t.common.cancel}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card style={{ ...cardStyle, background: 'linear-gradient(135deg, #f8fafc 0%, #fff7ed 100%)' }} bordered={false}>
            <Row gutter={[24, 24]} align="middle">
              <Col flex="auto">
                <Typography.Title level={3} style={{ marginBottom: 8 }}>
                  {t.extensions.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                  {t.extensions.subtitle}
                </Typography.Paragraph>
              </Col>
              <Col>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={() => void fetchExtensions()} />
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    {t.extensions.newExtension}
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.extensions.total} value={extensions.length} prefix={<AppstoreOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.extensions.enabledCount} value={enabledCount} valueStyle={{ color: '#389e0d' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title={t.extensions.defaultCount} value={defaultCount} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
      </Row>

      <Card style={cardStyle}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={extensions}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: t.extensions.empty }}
        />
      </Card>

      <Modal
        title={t.extensions.newExtension}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        okText={t.common.save}
        cancelText={t.common.cancel}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t.extensions.displayName}>
            <Input placeholder={t.extensions.displayNamePlaceholder} />
          </Form.Item>
          <Form.Item name="category" label={t.extensions.category}>
            <Input placeholder={t.extensions.categoryPlaceholder} />
          </Form.Item>
          <Form.Item name="defaultForNewProfiles" valuePropName="checked">
            <Checkbox>{t.extensions.defaultCheckbox}</Checkbox>
          </Form.Item>
          <Form.Item
            name="sourcePath"
            label={t.extensions.source}
            rules={[{ required: true, message: t.extensions.sourceRequired }]}
          >
            <Input placeholder={t.extensions.sourcePlaceholder} />
          </Form.Item>
          <Typography.Text type="secondary">
            {t.extensions.sourceHint}
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
};

export default Extensions;
