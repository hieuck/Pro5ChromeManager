import React, { useEffect, useState, useCallback } from 'react';
import {
  Tabs, Form, Input, InputNumber, Select, Switch, Button,
  Table, Tag, Space, Popconfirm, message, Typography, Row, Col, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined,
  DownloadOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
import OnboardingWizard from '../components/OnboardingWizard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppConfig {
  uiLanguage: 'vi' | 'en';
  profilesDir: string;
  headless: boolean;
  windowTitleSuffixEnabled: boolean;
  api: { host: string; port: number };
  sessionCheck: { enabledByDefault: boolean; headless: boolean; timeoutMs: number };
  runtimes: Record<string, { label: string; executablePath: string }>;
}

interface Runtime {
  key: string;
  name: string;
  executablePath: string;
  available: boolean;
}

interface BackupEntry {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

const GeneralTab: React.FC = () => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    void apiClient.get<AppConfig>('/api/config').then((res) => {
      if (res.success) {
        form.setFieldsValue({
          uiLanguage: res.data.uiLanguage,
          profilesDir: res.data.profilesDir,
          headless: res.data.headless,
          windowTitleSuffixEnabled: res.data.windowTitleSuffixEnabled,
          apiHost: res.data.api.host,
          apiPort: res.data.api.port,
          sessionCheckTimeout: res.data.sessionCheck.timeoutMs,
          sessionCheckHeadless: res.data.sessionCheck.headless,
        });
      }
    });
  }, [form]);

  async function handleSave(): Promise<void> {
    const values = await form.validateFields() as {
      uiLanguage: 'vi' | 'en';
      profilesDir: string;
      headless: boolean;
      windowTitleSuffixEnabled: boolean;
      apiHost: string;
      apiPort: number;
      sessionCheckTimeout: number;
      sessionCheckHeadless: boolean;
    };

    setSaving(true);
    const res = await apiClient.put('/api/config', {
      uiLanguage: values.uiLanguage,
      profilesDir: values.profilesDir,
      headless: values.headless,
      windowTitleSuffixEnabled: values.windowTitleSuffixEnabled,
      api: { host: values.apiHost, port: values.apiPort },
      sessionCheck: { timeoutMs: values.sessionCheckTimeout, headless: values.sessionCheckHeadless },
    });
    setSaving(false);

    if (res.success) {
      localStorage.setItem('uiLanguage', values.uiLanguage);
      void message.success('Đã lưu cài đặt');
    } else {
      void message.error(res.error);
    }
  }

  async function handleResetOnboarding(): Promise<void> {
    await apiClient.put('/api/config', { onboardingCompleted: false });
    setWizardOpen(true);
  }

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
      <Form.Item name="uiLanguage" label="Ngôn ngữ giao diện">
        <Select options={[{ label: 'Tiếng Việt', value: 'vi' }, { label: 'English', value: 'en' }]} />
      </Form.Item>
      <Form.Item name="profilesDir" label="Thư mục profiles" rules={[{ required: true }]}>
        <Input placeholder="./data/profiles" />
      </Form.Item>
      <Form.Item name="headless" label="Chế độ headless mặc định" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="windowTitleSuffixEnabled" label="Hiển thị tên profile trên tiêu đề cửa sổ" valuePropName="checked">
        <Switch />
      </Form.Item>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>API Server</Typography.Text>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item name="apiHost" label="Host">
            <Input placeholder="127.0.0.1" />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item name="apiPort" label="Port">
            <InputNumber min={1024} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>Session Check</Typography.Text>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item name="sessionCheckTimeout" label="Timeout (ms)">
            <InputNumber min={5000} max={120000} step={1000} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item name="sessionCheckHeadless" label="Headless" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
        Lưu cài đặt
      </Button>
      <Button
        style={{ marginLeft: 12 }}
        icon={<QuestionCircleOutlined />}
        onClick={() => void handleResetOnboarding()}
      >
        Xem lại hướng dẫn
      </Button>

      <OnboardingWizard open={wizardOpen} onFinish={() => setWizardOpen(false)} />
    </Form>
  );
};

// ─── Tab: Runtimes ────────────────────────────────────────────────────────────

const RuntimesTab: React.FC = () => {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [loading, setLoading] = useState(false);
  const [addForm] = Form.useForm();
  const [adding, setAdding] = useState(false);

  const fetchRuntimes = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<Runtime[]>('/api/runtimes');
    if (res.success) setRuntimes(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchRuntimes(); }, [fetchRuntimes]);

  async function handleAdd(): Promise<void> {
    const values = await addForm.validateFields() as { key: string; label: string; executablePath: string };
    setAdding(true);
    const res = await apiClient.post('/api/runtimes', values);
    setAdding(false);
    if (res.success) {
      addForm.resetFields();
      void fetchRuntimes();
    } else {
      void message.error(res.error);
    }
  }

  async function handleDelete(key: string): Promise<void> {
    const res = await apiClient.delete(`/api/runtimes/${key}`);
    if (res.success) void fetchRuntimes();
    else void message.error(res.error);
  }

  const columns = [
    { title: 'Tên', dataIndex: 'name', key: 'name' },
    { title: 'Key', dataIndex: 'key', key: 'key', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    {
      title: 'Đường dẫn',
      dataIndex: 'executablePath',
      key: 'executablePath',
      render: (v: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'available',
      key: 'available',
      width: 120,
      render: (v: boolean) => v
        ? <Tag icon={<CheckCircleOutlined />} color="success">Khả dụng</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">Không tìm thấy</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Runtime) => (
        <Popconfirm title="Xóa runtime này?" onConfirm={() => void handleDelete(record.key)} okText="Xóa" cancelText="Hủy">
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchRuntimes()}>Làm mới</Button>
      </Row>
      <Table
        rowKey="key"
        columns={columns}
        dataSource={runtimes}
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description="Chưa có runtime nào" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      <Typography.Text strong style={{ display: 'block', margin: '16px 0 8px' }}>Thêm runtime mới</Typography.Text>
      <Form form={addForm} layout="inline">
        <Form.Item name="key" rules={[{ required: true, message: 'Nhập key' }]}>
          <Input placeholder="key (vd: chrome)" style={{ width: 120 }} />
        </Form.Item>
        <Form.Item name="label" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="Tên hiển thị" style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="executablePath" rules={[{ required: true, message: 'Nhập đường dẫn' }]}>
          <Input placeholder="C:\...\chrome.exe" style={{ width: 300 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<PlusOutlined />} loading={adding} onClick={() => void handleAdd()}>
            Thêm
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

// ─── Tab: Backup ──────────────────────────────────────────────────────────────

const BackupTab: React.FC = () => {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<BackupEntry[]>('/api/backups');
    if (res.success) setBackups(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchBackups(); }, [fetchBackups]);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    const res = await apiClient.post<BackupEntry>('/api/backups');
    setCreating(false);
    if (res.success) {
      void message.success(`Đã tạo backup: ${res.data.filename}`);
      void fetchBackups();
    } else {
      void message.error(res.error);
    }
  }

  async function handleRestore(filename: string): Promise<void> {
    const res = await apiClient.post(`/api/backups/restore/${encodeURIComponent(filename)}`);
    if (res.success) void message.success('Đã khôi phục backup. Khởi động lại server để áp dụng.');
    else void message.error(res.error);
  }

  function handleExport(filename: string): void {
    window.open(`http://127.0.0.1:3210/api/backups/export/${encodeURIComponent(filename)}`, '_blank');
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (v: string) => { try { return new Date(v).toLocaleString('vi-VN'); } catch { return v; } },
    },
    {
      title: 'Kích thước',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      width: 100,
      render: (v: number) => formatSize(v),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: BackupEntry) => (
        <Space size={4}>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport(record.filename)}>
            Tải về
          </Button>
          <Popconfirm
            title="Khôi phục backup này? Dữ liệu hiện tại sẽ bị ghi đè."
            onConfirm={() => void handleRestore(record.filename)}
            okText="Khôi phục"
            cancelText="Hủy"
          >
            <Button size="small">Khôi phục</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Tự động backup mỗi 24h. Giữ tối đa 7 bản.
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchBackups()} />
          <Button type="primary" loading={creating} onClick={() => void handleCreate()}>
            Backup ngay
          </Button>
        </Space>
      </Row>
      <Table
        rowKey="filename"
        columns={columns}
        dataSource={backups}
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description="Chưa có backup nào" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </div>
  );
};

// ─── Tab: Logs ────────────────────────────────────────────────────────────────

const LogsTab: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<string[]>('/api/logs');
    if (res.success) setLines(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      <Row justify="end" style={{ marginBottom: 8 }}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchLogs()}>
          Làm mới
        </Button>
      </Row>
      <div
        style={{
          background: '#0d1117',
          color: '#c9d1d9',
          fontFamily: 'monospace',
          fontSize: 12,
          padding: 12,
          borderRadius: 6,
          height: 480,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {lines.length === 0
          ? <Typography.Text type="secondary">Không có log</Typography.Text>
          : lines.map((line, i) => <div key={i}>{line}</div>)
        }
      </div>
    </div>
  );
};

// ─── Main Settings ────────────────────────────────────────────────────────────

const Settings: React.FC = () => {
  const { t } = useTranslation();

  const tabItems = [
    { key: 'general', label: 'Chung', children: <GeneralTab /> },
    { key: 'runtimes', label: 'Runtimes', children: <RuntimesTab /> },
    { key: 'backup', label: 'Backup', children: <BackupTab /> },
    { key: 'logs', label: 'Logs', children: <LogsTab /> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t.settings.title}</Typography.Title>
      <Tabs items={tabItems} />
    </div>
  );
};

export default Settings;
