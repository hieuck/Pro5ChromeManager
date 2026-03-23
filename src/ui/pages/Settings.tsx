import React, { useEffect, useState, useCallback } from 'react';
import {
  Tabs, Form, Input, InputNumber, Select, Switch, Button,
  Table, Tag, Space, Popconfirm, message, Typography, Row, Col, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined,
  DownloadOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined,
  QuestionCircleOutlined, CopyOutlined,
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

interface SupportStatus {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  dataDir: string;
  logFileCount: number;
  diagnosticsReady: boolean;
  offlineSecretConfigured: boolean;
  codeSigningConfigured: boolean;
  supportPagesReady: boolean;
  onboardingCompleted: boolean;
  onboardingState: {
    status: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
    currentStep: number;
    selectedRuntime: string | null;
    draftProfileName: string | null;
    createdProfileId: string | null;
    lastOpenedAt: string | null;
    lastUpdatedAt: string | null;
    profileCreatedAt: string | null;
    completedAt: string | null;
    skippedAt: string | null;
  };
  profileCount: number;
  proxyCount: number;
  backupCount: number;
  feedbackCount: number;
  lastFeedbackAt: string | null;
  usageMetrics: {
    profileCreates: number;
    profileImports: number;
    profileLaunches: number;
    sessionChecks: number;
    sessionCheckLoggedIn: number;
    sessionCheckLoggedOut: number;
    sessionCheckErrors: number;
    lastProfileCreatedAt: string | null;
    lastProfileImportedAt: string | null;
    lastProfileLaunchAt: string | null;
    lastSessionCheckAt: string | null;
  };
  recentIncidentCount: number;
  recentErrorCount: number;
  lastIncidentAt: string | null;
  releaseReady: boolean;
  warnings: string[];
}

interface SupportSelfTestCheck {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface SupportSelfTestResult {
  status: 'pass' | 'warn' | 'fail';
  checkedAt: string;
  checks: SupportSelfTestCheck[];
}

interface IncidentEntry {
  timestamp: string;
  level: 'warn' | 'error';
  source: string;
  message: string;
}

interface SupportIncidentsResult {
  count: number;
  incidents: IncidentEntry[];
}

interface SupportFeedbackEntry {
  id: string;
  createdAt: string;
  category: 'bug' | 'feedback' | 'question';
  sentiment: 'negative' | 'neutral' | 'positive';
  message: string;
  email: string | null;
  appVersion: string | null;
}

interface SupportFeedbackResult {
  count: number;
  entries: SupportFeedbackEntry[];
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

  function handleExportDiagnostics(): void {
    window.open('http://127.0.0.1:3210/api/support/diagnostics', '_blank');
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

      <Button
        style={{ marginLeft: 12 }}
        icon={<DownloadOutlined />}
        onClick={handleExportDiagnostics}
      >
        Export Diagnostics
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

const SupportTab: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SupportStatus | null>(null);
  const [selfTest, setSelfTest] = useState<SupportSelfTestResult | null>(null);
  const [incidentState, setIncidentState] = useState<SupportIncidentsResult | null>(null);
  const [feedbackState, setFeedbackState] = useState<SupportFeedbackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selfTesting, setSelfTesting] = useState(false);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackForm] = Form.useForm();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<SupportStatus>('/api/support/status');
    if (res.success) setStatus(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const fetchIncidents = useCallback(async () => {
    setIncidentLoading(true);
    const res = await apiClient.get<SupportIncidentsResult>('/api/support/incidents?limit=10');
    if (res.success) setIncidentState(res.data);
    setIncidentLoading(false);
  }, []);

  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const res = await apiClient.get<SupportFeedbackResult>('/api/support/feedback?limit=5');
    if (res.success) setFeedbackState(res.data);
    setFeedbackLoading(false);
  }, []);

  useEffect(() => { void fetchFeedback(); }, [fetchFeedback]);

  async function handleCopySupportSummary(): Promise<void> {
    if (!status) {
      void message.warning(t.settings.supportSummaryUnavailable);
      return;
    }

    const summaryLines = [
      t.settings.supportSummaryTitle,
      `${t.settings.appVersionLabel}: ${status.appVersion}`,
      `${t.settings.nodeVersionLabel}: ${status.nodeVersion}`,
      `${t.settings.platformLabel}: ${status.platform}/${status.arch}`,
      `${t.settings.uptimeLabel}: ${formatUptime(status.uptimeSeconds)}`,
      `${t.settings.dataDirLabel}: ${status.dataDir}`,
      `${t.settings.diagnosticsLabel}: ${status.diagnosticsReady ? t.settings.diagnosticsReadyState : t.settings.diagnosticsMissingState}`,
      `${t.settings.onboardingLabel}: ${status.onboardingCompleted ? t.settings.statusCompleted : t.settings.statusPending}`,
      `${t.settings.onboardingStateLabel}: ${status.onboardingState.status} (${t.settings.stepLabel} ${status.onboardingState.currentStep})`,
      `${t.settings.profilesLabel}: ${status.profileCount}`,
      `${t.settings.proxiesLabel}: ${status.proxyCount}`,
      `${t.settings.backupsLabel}: ${status.backupCount}`,
      `${t.settings.feedbackInboxLabel}: ${status.feedbackCount} ${t.settings.entriesLabel}`,
      `${t.settings.usageLabel}: ${status.usageMetrics.profileCreates} ${t.settings.createdLabel} / ${status.usageMetrics.profileImports} ${t.settings.importedLabel} / ${status.usageMetrics.profileLaunches} ${t.settings.launchesLabel}`,
      `${t.settings.sessionChecksLabel}: ${status.usageMetrics.sessionChecks} ${t.settings.totalLabel} / ${status.usageMetrics.sessionCheckLoggedIn} ${t.settings.loggedInLabel} / ${status.usageMetrics.sessionCheckLoggedOut} ${t.settings.loggedOutLabel} / ${status.usageMetrics.sessionCheckErrors} ${t.settings.errorsLabel}`,
      `${t.settings.offlineSecretLabel}: ${status.offlineSecretConfigured ? t.settings.configuredState : t.settings.missingState}`,
      `${t.settings.codeSigningLabel}: ${status.codeSigningConfigured ? t.settings.configuredState : t.settings.missingState}`,
      `${t.settings.supportPagesLabel}: ${status.supportPagesReady ? t.settings.readyState : t.settings.missingState}`,
      `${t.settings.releaseReadinessLabel}: ${status.releaseReady ? t.settings.readyState : t.settings.needsAttentionState}`,
      `${t.settings.recentIncidentsLabel}: ${status.recentIncidentCount} ${t.settings.totalLabel} / ${status.recentErrorCount} ${t.settings.errorsLabel}`,
      `${t.settings.lastIncidentLabel}: ${status.lastIncidentAt ? new Date(status.lastIncidentAt).toLocaleString() : t.settings.noneValue}`,
    ];

    if (status.usageMetrics.lastProfileCreatedAt) {
      summaryLines.push(`${t.settings.lastProfileCreatedLabel}: ${new Date(status.usageMetrics.lastProfileCreatedAt).toLocaleString()}`);
    }
    if (status.usageMetrics.lastProfileImportedAt) {
      summaryLines.push(`${t.settings.lastProfileImportedLabel}: ${new Date(status.usageMetrics.lastProfileImportedAt).toLocaleString()}`);
    }
    if (status.usageMetrics.lastProfileLaunchAt) {
      summaryLines.push(`${t.settings.lastLaunchLabel}: ${new Date(status.usageMetrics.lastProfileLaunchAt).toLocaleString()}`);
    }
    if (status.usageMetrics.lastSessionCheckAt) {
      summaryLines.push(`${t.settings.lastSessionCheckLabel}: ${new Date(status.usageMetrics.lastSessionCheckAt).toLocaleString()}`);
    }
    if (status.onboardingState.lastOpenedAt) {
      summaryLines.push(`${t.settings.lastOnboardingOpenLabel}: ${new Date(status.onboardingState.lastOpenedAt).toLocaleString()}`);
    }
    if (status.onboardingState.profileCreatedAt) {
      summaryLines.push(`${t.settings.onboardingProfileCreatedLabel}: ${new Date(status.onboardingState.profileCreatedAt).toLocaleString()}`);
    }
    if (status.lastFeedbackAt) {
      summaryLines.push(`Last feedback: ${new Date(status.lastFeedbackAt).toLocaleString()}`);
    }

    if (status.warnings.length > 0) {
      summaryLines.push(`${t.settings.warningsLabel}: ${status.warnings.join(' | ')}`);
    } else {
      summaryLines.push(`${t.settings.warningsLabel}: ${t.settings.noneValue}`);
    }

    if (selfTest) {
      summaryLines.push(`${t.settings.selfTestLabel}: ${getSelfTestStatusLabel(selfTest.status)} @ ${new Date(selfTest.checkedAt).toLocaleString()}`);
      summaryLines.push(
        ...selfTest.checks.map((check) => `- ${check.label}: ${getSelfTestStatusLabel(check.status)} (${check.detail})`),
      );
    }

    if (incidentState && incidentState.incidents.length > 0) {
      summaryLines.push(t.settings.recentIncidentDetailsLabel);
      summaryLines.push(
        ...incidentState.incidents.slice(0, 5).map((incident) =>
          `- [${getIncidentLevelLabel(incident.level)}] ${incident.source} @ ${new Date(incident.timestamp).toLocaleString()}: ${incident.message}`),
      );
    }

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.settings.supportSummaryCopied);
    } catch {
      void message.error(t.settings.supportSummaryCopyFailed);
    }
  }

  async function runSelfTest(): Promise<void> {
    setSelfTesting(true);
    const res = await apiClient.post<SupportSelfTestResult>('/api/support/self-test');
    setSelfTesting(false);
    if (res.success) {
      setSelfTest(res.data);
      void message.success(t.settings.supportSelfTestCompleted);
    } else {
      void message.error(res.error);
    }
  }

  async function handleSubmitFeedback(): Promise<void> {
    const values = await feedbackForm.validateFields() as {
      category: 'bug' | 'feedback' | 'question';
      sentiment: 'negative' | 'neutral' | 'positive';
      message: string;
      email?: string;
    };

    setSubmittingFeedback(true);
    const res = await apiClient.post<SupportFeedbackEntry>('/api/support/feedback', {
      ...values,
      appVersion: status?.appVersion ?? '',
    });
    setSubmittingFeedback(false);

    if (res.success) {
      feedbackForm.resetFields();
      void message.success(t.settings.feedbackSaved);
      await Promise.all([fetchStatus(), fetchFeedback()]);
    } else {
      void message.error(res.error);
    }
  }

  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  }

  function getSelfTestStatusLabel(statusValue: SupportSelfTestResult['status']): string {
    if (statusValue === 'pass') return t.settings.statusPass;
    if (statusValue === 'warn') return t.settings.statusWarn;
    return t.settings.statusFail;
  }

  function getFeedbackCategoryLabel(category: SupportFeedbackEntry['category']): string {
    if (category === 'bug') return t.settings.feedbackCategoryBug;
    if (category === 'question') return t.settings.feedbackCategoryQuestion;
    return t.settings.feedbackCategoryFeedback;
  }

  function getFeedbackSentimentLabel(sentiment: SupportFeedbackEntry['sentiment']): string {
    if (sentiment === 'positive') return t.settings.feedbackSentimentPositive;
    if (sentiment === 'negative') return t.settings.feedbackSentimentNegative;
    return t.settings.feedbackSentimentNeutral;
  }

  function getIncidentLevelLabel(level: IncidentEntry['level']): string {
    return level === 'error' ? t.settings.incidentLevelError : t.settings.incidentLevelWarn;
  }

  return (
    <div>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => void handleCopySupportSummary()}>
            {t.settings.copySupportSummary}
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => window.open('http://127.0.0.1:3210/api/support/diagnostics', '_blank')}>
            {t.settings.exportDiagnostics}
          </Button>
          <Button onClick={() => void fetchIncidents()} loading={incidentLoading}>
            {t.settings.refreshIncidents}
          </Button>
          <Button onClick={() => void runSelfTest()} loading={selfTesting}>
            {t.settings.runSelfTest}
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchStatus()}>
            {t.settings.refresh}
          </Button>
        </Space>
      </Row>
      {status ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text><strong>{t.settings.appVersionLabel}:</strong> {status.appVersion}</Typography.Text>
          <Typography.Text><strong>{t.settings.nodeVersionLabel}:</strong> {status.nodeVersion}</Typography.Text>
          <Typography.Text><strong>{t.settings.platformLabel}:</strong> {status.platform} / {status.arch}</Typography.Text>
          <Typography.Text><strong>{t.settings.uptimeLabel}:</strong> {formatUptime(status.uptimeSeconds)}</Typography.Text>
          <Typography.Text><strong>{t.settings.dataDirLabel}:</strong> {status.dataDir}</Typography.Text>
          <Typography.Text><strong>{t.settings.logFilesLabel}:</strong> {status.logFileCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingLabel}:</strong> {status.onboardingCompleted ? t.settings.statusCompleted : t.settings.statusPending}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingStateLabel}:</strong> {status.onboardingState.status} / {t.settings.stepLabel} {status.onboardingState.currentStep}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingRuntimeLabel}:</strong> {status.onboardingState.selectedRuntime ?? t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingDraftProfileLabel}:</strong> {status.onboardingState.draftProfileName ?? t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.lastOnboardingOpenLabel}:</strong> {status.onboardingState.lastOpenedAt ? new Date(status.onboardingState.lastOpenedAt).toLocaleString() : t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.profilesLabel}:</strong> {status.profileCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.proxiesLabel}:</strong> {status.proxyCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.backupsLabel}:</strong> {status.backupCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.feedbackInboxLabel}:</strong> {status.feedbackCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.lastFeedbackLabel}:</strong> {status.lastFeedbackAt ? new Date(status.lastFeedbackAt).toLocaleString() : t.settings.noneValue}</Typography.Text>
          <Typography.Text>
            <strong>{t.settings.usageLabel}:</strong> {status.usageMetrics.profileCreates} {t.settings.createdLabel} / {status.usageMetrics.profileImports} {t.settings.importedLabel} / {status.usageMetrics.profileLaunches} {t.settings.launchesLabel}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.sessionChecksLabel}:</strong> {status.usageMetrics.sessionChecks} {t.settings.totalLabel} / {status.usageMetrics.sessionCheckLoggedIn} {t.settings.loggedInLabel} / {status.usageMetrics.sessionCheckLoggedOut} {t.settings.loggedOutLabel} / {status.usageMetrics.sessionCheckErrors} {t.settings.errorsLabel}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.lastUsageLabel}:</strong>{' '}
            {status.usageMetrics.lastProfileLaunchAt
              ? `${t.settings.lastUsageLaunch} ${new Date(status.usageMetrics.lastProfileLaunchAt).toLocaleString()}`
              : status.usageMetrics.lastProfileCreatedAt
                ? `${t.settings.lastUsageCreate} ${new Date(status.usageMetrics.lastProfileCreatedAt).toLocaleString()}`
                : status.usageMetrics.lastProfileImportedAt
                  ? `${t.settings.lastUsageImport} ${new Date(status.usageMetrics.lastProfileImportedAt).toLocaleString()}`
                  : status.usageMetrics.lastSessionCheckAt
                    ? `${t.settings.lastUsageSessionCheck} ${new Date(status.usageMetrics.lastSessionCheckAt).toLocaleString()}`
                    : t.settings.noneValue}
          </Typography.Text>
          <Typography.Text><strong>{t.settings.recentIncidentsLabel}:</strong> {status.recentIncidentCount} {t.settings.totalLabel} / {status.recentErrorCount} {t.settings.errorsLabel}</Typography.Text>
          <Typography.Text><strong>{t.settings.lastIncidentLabel}:</strong> {status.lastIncidentAt ? new Date(status.lastIncidentAt).toLocaleString() : t.settings.noneValue}</Typography.Text>
          <Typography.Text>
            <strong>{t.settings.diagnosticsLabel}:</strong> {status.diagnosticsReady ? t.settings.diagnosticsReadyState : t.settings.diagnosticsMissingState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.offlineSecretLabel}:</strong> {status.offlineSecretConfigured ? t.settings.configuredState : t.settings.missingState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.codeSigningLabel}:</strong> {status.codeSigningConfigured ? t.settings.configuredState : t.settings.missingState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.supportPagesLabel}:</strong> {status.supportPagesReady ? t.settings.readyState : t.settings.missingPagesState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.releaseReadinessLabel}:</strong> {status.releaseReady ? t.settings.readyState : t.settings.needsAttentionState}
          </Typography.Text>
          {status.warnings.length > 0 ? (
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>{t.settings.warningsLabel}</Typography.Text>
              {status.warnings.map((warning) => (
                <Tag key={warning} color="warning" style={{ marginBottom: 8 }}>
                  {warning}
                </Tag>
              ))}
            </div>
          ) : (
            <Tag color="success">{t.settings.operationallyReady}</Tag>
          )}
          {selfTest ? (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
                {t.settings.selfTestLabel} ({new Date(selfTest.checkedAt).toLocaleString()})
              </Typography.Text>
              <Tag color={selfTest.status === 'pass' ? 'success' : selfTest.status === 'warn' ? 'warning' : 'error'}>
                {getSelfTestStatusLabel(selfTest.status)}
              </Tag>
              <div style={{ marginTop: 8 }}>
                {selfTest.checks.map((check) => (
                  <div key={check.key} style={{ marginBottom: 8 }}>
                    <Tag color={check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error'}>
                      {getSelfTestStatusLabel(check.status)}
                    </Tag>
                    <Typography.Text strong>{check.label}:</Typography.Text>{' '}
                    <Typography.Text type="secondary">{check.detail}</Typography.Text>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 8 }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t.settings.feedbackInbox}
            </Typography.Text>
            <Form form={feedbackForm} layout="vertical">
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="category" label={t.settings.feedbackCategoryLabel} initialValue="feedback" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { label: t.settings.feedbackCategoryFeedback, value: 'feedback' },
                        { label: t.settings.feedbackCategoryBug, value: 'bug' },
                        { label: t.settings.feedbackCategoryQuestion, value: 'question' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="sentiment" label={t.settings.feedbackSentimentLabel} initialValue="neutral" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { label: t.settings.feedbackSentimentNeutral, value: 'neutral' },
                        { label: t.settings.feedbackSentimentPositive, value: 'positive' },
                        { label: t.settings.feedbackSentimentNegative, value: 'negative' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="email" label={t.settings.feedbackEmailLabel}>
                    <Input placeholder={t.settings.feedbackEmailPlaceholder} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="message"
                label={t.settings.feedbackMessageLabel}
                rules={[{ required: true, min: 10, message: t.settings.feedbackMessageMin }]}
              >
                <Input.TextArea rows={4} placeholder={t.settings.feedbackMessagePlaceholder} />
              </Form.Item>
              <Space style={{ marginBottom: 12 }}>
                <Button type="primary" loading={submittingFeedback} onClick={() => void handleSubmitFeedback()}>
                  {t.settings.saveFeedback}
                </Button>
                <Button loading={feedbackLoading} onClick={() => void fetchFeedback()}>
                  {t.settings.refreshFeedback}
                </Button>
              </Space>
            </Form>
            {feedbackState && feedbackState.entries.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                {feedbackState.entries.map((entry) => (
                  <div key={entry.id} style={{ marginBottom: 10 }}>
                    <Tag color={entry.category === 'bug' ? 'error' : entry.category === 'question' ? 'processing' : 'default'}>
                      {getFeedbackCategoryLabel(entry.category)}
                    </Tag>
                    <Tag color={entry.sentiment === 'negative' ? 'error' : entry.sentiment === 'positive' ? 'success' : 'default'}>
                      {getFeedbackSentimentLabel(entry.sentiment)}
                    </Tag>
                    <Typography.Text type="secondary">{new Date(entry.createdAt).toLocaleString()}</Typography.Text>
                    <div>
                      <Typography.Text>{entry.message}</Typography.Text>
                    </div>
                    <Typography.Text type="secondary">
                      {entry.email ? `${t.settings.feedbackContactPrefix}: ${entry.email}` : t.settings.feedbackNoContactEmail}{entry.appVersion ? ` | ${t.settings.feedbackAppPrefix} ${entry.appVersion}` : ''}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                {feedbackLoading ? t.settings.loadingFeedback : t.settings.noFeedbackSaved}
              </Typography.Text>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
              {t.settings.recentIncidents}
            </Typography.Text>
            {incidentState && incidentState.incidents.length > 0 ? (
              <div>
                {incidentState.incidents.map((incident, index) => (
                  <div key={`${incident.timestamp}-${incident.source}-${index}`} style={{ marginBottom: 10 }}>
                    <Tag color={incident.level === 'error' ? 'error' : 'warning'}>
                      {getIncidentLevelLabel(incident.level)}
                    </Tag>
                    <Typography.Text strong>{incident.source}</Typography.Text>{' '}
                    <Typography.Text type="secondary">
                      {new Date(incident.timestamp).toLocaleString()}
                    </Typography.Text>
                    <div>
                      <Typography.Text>{incident.message}</Typography.Text>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary">
                {incidentLoading ? t.settings.loadingIncidents : t.settings.noRecentIncidents}
              </Typography.Text>
            )}
          </div>
        </Space>
      ) : (
        <Typography.Text type="secondary">{t.settings.supportStatusLoadFailed}</Typography.Text>
      )}
    </div>
  );
};

// ─── Main Settings ────────────────────────────────────────────────────────────

const Settings: React.FC = () => {
  const { t } = useTranslation();

  const tabItems = [
    { key: 'general', label: t.settings.general, children: <GeneralTab /> },
    { key: 'runtimes', label: t.settings.runtimes, children: <RuntimesTab /> },
    { key: 'backup', label: t.settings.backup, children: <BackupTab /> },
    { key: 'logs', label: t.settings.logs, children: <LogsTab /> },
    { key: 'support', label: t.settings.support, children: <SupportTab /> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t.settings.title}</Typography.Title>
      <Tabs items={tabItems} />
    </div>
  );
};

export default Settings;
