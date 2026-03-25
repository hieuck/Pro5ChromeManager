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
    void message.success('Đã thêm extension');
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
      title: 'Tên',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          <Typography.Text type="secondary">
            {record.version ? `v${record.version}` : 'Không rõ version'}
            {record.category ? ` · ${record.category}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Đường dẫn',
      key: 'path',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.entryPath}</Typography.Text>
          {record.description ? <Typography.Text type="secondary">{record.description}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'enabled',
      width: 150,
      render: (_, record) => (
        <Space>
          <Switch
            checked={record.enabled}
            loading={Boolean(updatingIds[record.id])}
            onChange={(enabled) => { void handleToggle(record, enabled); }}
          />
          <Badge status={record.enabled ? 'success' : 'default'} text={record.enabled ? 'Bật' : 'Tắt'} />
        </Space>
      ),
    },
    {
      title: 'Mặc định',
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
            text={record.defaultForNewProfiles ? 'Profile mới' : 'Tùy chọn'}
          />
        </Space>
      ),
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Popconfirm
          title="Xóa extension này?"
          onConfirm={() => void handleDelete(record.id)}
          okText="Xóa"
          cancelText="Hủy"
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
                  Extension Center
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                  Quản lý extension cho nhiều profile từ một chỗ. Hồ sơ nào được gán extension sẽ tự nạp khi khởi chạy,
                  kèm hỗ trợ import từ package hoặc Chrome Web Store.
                </Typography.Paragraph>
              </Col>
              <Col>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={() => void fetchExtensions()} />
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    Thêm extension
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title="Tổng extension" value={extensions.length} prefix={<AppstoreOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title="Đang bật" value={enabledCount} valueStyle={{ color: '#389e0d' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={cardStyle}>
            <Statistic title="Mặc định cho profile mới" value={defaultCount} valueStyle={{ color: '#1677ff' }} />
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
          locale={{ emptyText: 'Chưa có extension nào. Hãy thêm một extension từ thư mục, package hoặc Chrome Web Store.' }}
        />
      </Card>

      <Modal
        title="Thêm extension"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên hiển thị">
            <Input placeholder="Để trống để lấy từ manifest.json" />
          </Form.Item>
          <Form.Item name="category" label="Nhóm extension">
            <Input placeholder="Ví dụ: wallet, automation, ads, social" />
          </Form.Item>
          <Form.Item name="defaultForNewProfiles" valuePropName="checked">
            <Checkbox>Gán mặc định cho profile mới</Checkbox>
          </Form.Item>
          <Form.Item
            name="sourcePath"
            label="Nguồn extension"
            rules={[{ required: true, message: 'Nhập đường dẫn, Chrome Web Store URL hoặc extension ID' }]}
          >
            <Input placeholder="Ví dụ: C:\\Extensions\\MetaMask, C:\\Downloads\\wallet.zip, C:\\Downloads\\wallet.crx hoặc aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" />
          </Form.Item>
          <Typography.Text type="secondary">
            Workspace này hỗ trợ thư mục unpacked có `manifest.json`, gói `.zip`, `.crx`, và Chrome Web Store qua URL
            hoặc extension ID. Với package/store import, app sẽ tự sao chép vào vùng managed để dùng ổn định cho nhiều profile.
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
};

export default Extensions;
