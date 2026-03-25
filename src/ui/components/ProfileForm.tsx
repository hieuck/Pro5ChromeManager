import React, { useEffect, useState } from 'react';
import {
  Drawer, Form, Input, Select, Tabs, Button, Space,
  message, Spin, Table, Typography, Upload,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { apiClient, buildApiUrl } from '../api/client';
import ProxySelector from './ProxySelector';
import FingerprintEditor from './FingerprintEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FingerprintConfig {
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  canvas: { noise: number; seed: number };
  webgl: { renderer: string; vendor: string; noise: number };
  audio: { noise: number };
  fonts: string[];
  webrtcPolicy: 'default' | 'disable_non_proxied_udp' | 'proxy_only';
}

interface Profile {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  group: string | null;
  runtime: string;
  proxy: { id: string } | null;
  extensionIds: string[];
  bookmarks: ProfileBookmark[];
  fingerprint: FingerprintConfig;
  lastUsedAt: string | null;
  totalSessions: number;
}

interface ExtensionRecord {
  id: string;
  name: string;
  version: string | null;
  enabled: boolean;
  category?: string | null;
}

interface ExtensionBundle {
  key: string;
  label: string;
  extensionIds: string[];
  extensionCount: number;
}

interface ProfileCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null;
}

interface ProfileBookmark {
  name: string;
  url: string;
  folder: string | null;
}

interface ActivitySession {
  profileId: string;
  startedAt: string;
  stoppedAt?: string;
  durationMs?: number;
}

interface Runtime {
  key: string;
  name?: string;
  label?: string;
  available: boolean;
}

interface ProfileFormProps {
  open: boolean;
  profileId?: string;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProfileForm: React.FC<ProfileFormProps> = ({ open, profileId, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fingerprint, setFingerprint] = useState<FingerprintConfig | undefined>();
  const [proxyId, setProxyId] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [extensionBundles, setExtensionBundles] = useState<ExtensionBundle[]>([]);
  const [activity, setActivity] = useState<ActivitySession[]>([]);
  const [activeTab, setActiveTab] = useState('general');
  const [importFiles, setImportFiles] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [cookieText, setCookieText] = useState('[]');
  const [cookieCount, setCookieCount] = useState(0);
  const [cookiesLoading, setCookiesLoading] = useState(false);
  const [cookiesSaving, setCookiesSaving] = useState(false);
  const [bookmarkText, setBookmarkText] = useState('[]');

  const isEdit = !!profileId;

  // ─── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setActiveTab('general');
    setImportFiles([]);

    void apiClient.get<Runtime[]>('/api/runtimes').then((res) => {
      if (res.success) setRuntimes(res.data);
    });
    void apiClient.get<ExtensionRecord[]>('/api/extensions').then((res) => {
      if (res.success) setExtensions(res.data);
    });
    void apiClient.get<ExtensionBundle[]>('/api/extensions/bundles').then((res) => {
      if (res.success) setExtensionBundles(res.data);
    });

    if (isEdit && profileId) {
      setLoading(true);
      void apiClient.get<Profile>(`/api/profiles/${profileId}`).then((res) => {
        setLoading(false);
        if (!res.success) { void message.error(res.error); return; }
        const p = res.data;
        form.setFieldsValue({
          name: p.name,
          notes: p.notes,
          tags: p.tags,
          group: p.group ?? undefined,
          runtime: p.runtime,
          extensionIds: p.extensionIds ?? [],
          extensionCategories: [],
        });
        setBookmarkText(JSON.stringify(p.bookmarks ?? [], null, 2));
        setFingerprint(p.fingerprint);
        setProxyId(p.proxy?.id ?? null);
      });

      void apiClient.get<ActivitySession[]>(`/api/profiles/${profileId}/activity`).then((res) => {
        if (res.success) setActivity(res.data);
      });
      setCookiesLoading(true);
      void apiClient.get<{ count: number; cookies: ProfileCookie[] }>(`/api/profiles/${profileId}/cookies`).then((res) => {
        setCookiesLoading(false);
        if (!res.success) {
          return;
        }
        setCookieCount(res.data.count);
        setCookieText(JSON.stringify(res.data.cookies, null, 2));
      });
    } else {
      form.resetFields();
      form.setFieldValue('extensionCategories', []);
      setFingerprint(undefined);
      setProxyId(null);
      setActivity([]);
      setBookmarkText('[]');
      setCookieText('[]');
      setCookieCount(0);
    }
  }, [open, profileId, isEdit, form]);

  // ─── Save ────────────────────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    let values: { name: string; notes?: string; tags?: string[]; group?: string; runtime?: string };
    try {
      values = await form.validateFields() as typeof values;
    } catch {
      return;
    }

    let parsedBookmarks: ProfileBookmark[];
    try {
      parsedBookmarks = JSON.parse(bookmarkText || '[]') as ProfileBookmark[];
      if (!Array.isArray(parsedBookmarks)) {
        throw new Error('Bookmarks must be an array');
      }
    } catch {
      void message.error('Bookmark JSON không hợp lệ');
      return;
    }

    setSaving(true);
    const payload = {
      name: values.name,
      notes: values.notes ?? '',
      tags: values.tags ?? [],
      group: values.group ?? null,
      runtime: values.runtime ?? 'auto',
      proxyId,
      extensionIds: form.getFieldValue('extensionIds') ?? [],
      extensionCategories: form.getFieldValue('extensionCategories') ?? [],
      bookmarks: parsedBookmarks,
      fingerprint,
    };

    const res = isEdit && profileId
      ? await apiClient.put(`/api/profiles/${profileId}`, payload)
      : await apiClient.post('/api/profiles', payload);

    setSaving(false);
    if (!res.success) { void message.error(res.error); return; }
    void message.success(isEdit ? 'Đã cập nhật hồ sơ' : 'Đã tạo hồ sơ');
    onSaved();
  }

  // ─── Bulk import ─────────────────────────────────────────────────────────────

  async function handleBulkImport(): Promise<void> {
    if (importFiles.length === 0) return;
    setImporting(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of importFiles) {
      if (!file.originFileObj) continue;
      const formData = new FormData();
      formData.append('file', file.originFileObj);
      try {
      const res = await fetch(buildApiUrl('/api/profiles/import'), {
          method: 'POST',
          body: formData,
        });
        const json = await res.json() as { success: boolean; error?: string };
        if (json.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setImporting(false);
    if (successCount > 0) void message.success(`Đã import ${successCount} profile`);
    if (failCount > 0) void message.warning(`${failCount} file thất bại`);
    if (successCount > 0) { setImportFiles([]); onSaved(); }
  }

  function applyBundleSelection(selectedCategories: string[]): void {
    const selectedIds = new Set<string>(form.getFieldValue('extensionIds') ?? []);

    for (const category of selectedCategories) {
      const bundle = extensionBundles.find((item) => item.key === category);
      if (!bundle) {
        continue;
      }
      for (const extensionId of bundle.extensionIds) {
        selectedIds.add(extensionId);
      }
    }

    form.setFieldValue('extensionCategories', selectedCategories);
    form.setFieldValue('extensionIds', Array.from(selectedIds));
  }

  async function handleImportCookies(): Promise<void> {
    if (!profileId) {
      void message.warning('Hãy lưu hồ sơ trước khi import cookie.');
      return;
    }

    let parsed: ProfileCookie[];
    try {
      parsed = JSON.parse(cookieText) as ProfileCookie[];
    } catch {
      void message.error('Cookie JSON không hợp lệ');
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      void message.warning('Hãy nhập ít nhất một cookie hợp lệ');
      return;
    }

    setCookiesSaving(true);
    const res = await apiClient.post<{ count: number; cookies: ProfileCookie[] }>(`/api/profiles/${profileId}/cookies/import`, {
      cookies: parsed,
    });
    setCookiesSaving(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setCookieCount(res.data.count);
    setCookieText(JSON.stringify(res.data.cookies, null, 2));
    void message.success(`Đã import ${res.data.count} cookie`);
  }

  async function handleClearCookies(): Promise<void> {
    if (!profileId) {
      return;
    }

    setCookiesSaving(true);
    const res = await apiClient.delete(`/api/profiles/${profileId}/cookies`);
    setCookiesSaving(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setCookieText('[]');
    setCookieCount(0);
    void message.success('Đã xóa cookie jar của hồ sơ');
  }

  function handleExportCookies(): void {
    if (!profileId) {
      return;
    }
    window.open(buildApiUrl(`/api/profiles/${profileId}/cookies/export`), '_blank');
  }

  // ─── Tabs ────────────────────────────────────────────────────────────────────

  const tabItems = [
    {
      key: 'general',
      label: 'Chung',
      children: (
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên hồ sơ" rules={[{ required: true, message: 'Nhập tên hồ sơ' }]}>
            <Input placeholder="Ví dụ: Facebook Account 1" />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="group" label="Nhóm">
            <Input placeholder="Ví dụ: Marketing, E-commerce" />
          </Form.Item>
          <Form.Item name="tags" label="Nhãn">
            <Select mode="tags" placeholder="Thêm nhãn..." />
          </Form.Item>
          <Form.Item name="runtime" label="Trình duyệt">
            <Select
              placeholder="Tự động chọn"
              options={[
                { label: 'Tự động', value: 'auto' },
                ...runtimes.map((r) => ({
                  label: `${r.label ?? r.name ?? r.key}${r.available ? '' : ' (không khả dụng)'}`,
                  value: r.key,
                  disabled: !r.available,
                })),
              ]}
            />
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'proxy',
      label: 'Proxy',
      children: (
        <div style={{ paddingTop: 8 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Chọn proxy cho hồ sơ này. Để trống nếu không dùng proxy.
          </Typography.Text>
          <ProxySelector value={proxyId} onChange={setProxyId} />
        </div>
      ),
    },
    {
      key: 'extensions',
      label: 'Tiện ích',
      children: (
        <Form form={form} layout="vertical">
          <Form.Item name="extensionCategories" label="Bundle theo use case">
            <Select
              mode="multiple"
              placeholder="Chọn nhóm extension để gắn nhanh theo use case"
              options={extensionBundles.map((bundle) => ({
                label: `${bundle.label} · ${bundle.extensionCount} extension`,
                value: bundle.key,
              }))}
              onChange={applyBundleSelection}
            />
          </Form.Item>
          <Form.Item name="extensionIds" label="Extensions gắn với hồ sơ">
            <Select
              mode="multiple"
              placeholder="Chọn extension sẽ nạp cùng profile"
              options={extensions.map((extension) => ({
                label: `${extension.name}${extension.version ? ` · v${extension.version}` : ''}${extension.enabled ? '' : ' (đã tắt)'}`,
                value: extension.id,
                disabled: !extension.enabled,
              }))}
            />
          </Form.Item>
          <Typography.Text type="secondary">
            Bundle sẽ tự thêm cả nhóm extension theo category. Danh sách bên dưới vẫn cho phép bạn tinh chỉnh từng extension cụ thể trước khi lưu.
          </Typography.Text>
        </Form>
      ),
    },
    {
      key: 'fingerprint',
      label: 'Dấu vân tay',
      children: (
        <FingerprintEditor value={fingerprint} onChange={setFingerprint} />
      ),
    },
    {
      key: 'bookmarks',
      label: 'Bookmarks',
      children: (
        <div style={{ paddingTop: 8 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Quản lý bookmarks dưới dạng JSON. Khi lưu hồ sơ, app sẽ đồng bộ thẳng vào file bookmark của Chromium profile.
          </Typography.Text>
          <Input.TextArea
            rows={12}
            value={bookmarkText}
            onChange={(event) => setBookmarkText(event.target.value)}
            placeholder={'[\n  {"name":"Google","url":"https://www.google.com","folder":"Daily"},\n  {"name":"Docs","url":"https://docs.example.com","folder":null}\n]'}
          />
        </div>
      ),
    },
    {
      key: 'activity',
      label: 'Hoạt động',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Table
            size="small"
            dataSource={activity}
            rowKey={(r) => r.startedAt}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: 'Chưa có phiên nào' }}
            columns={[
              {
                title: 'Bắt đầu',
                dataIndex: 'startedAt',
                render: (v: string) => new Date(v).toLocaleString('vi-VN'),
              },
              {
                title: 'Kết thúc',
                dataIndex: 'stoppedAt',
                render: (v?: string) => v ? new Date(v).toLocaleString('vi-VN') : '—',
              },
              {
                title: 'Thời gian',
                dataIndex: 'durationMs',
                render: (v?: number) => v ? `${Math.round(v / 1000)}s` : '—',
              },
            ]}
          />
          {isEdit ? (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                Cookies
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Import hoặc export cookie JSON cho hồ sơ này. Cookie đã lưu sẽ được tự bơm vào browser khi profile khởi chạy.
              </Typography.Text>
              <Typography.Text style={{ display: 'block', marginBottom: 12 }}>
                Cookie hiện có: <strong>{cookieCount}</strong>
              </Typography.Text>
              <Input.TextArea
                rows={12}
                value={cookieText}
                onChange={(event) => setCookieText(event.target.value)}
                placeholder='[{"name":"session","value":"abc","domain":".example.com","path":"/"}]'
              />
              <Space style={{ marginTop: 12 }}>
                <Button loading={cookiesSaving} type="primary" onClick={() => void handleImportCookies()}>
                  Import cookies
                </Button>
                <Button loading={cookiesSaving || cookiesLoading} onClick={handleExportCookies} disabled={cookieCount === 0}>
                  Export JSON
                </Button>
                <Button danger loading={cookiesSaving} onClick={() => void handleClearCookies()} disabled={cookieCount === 0}>
                  Xóa cookies
                </Button>
              </Space>
            </div>
          ) : null}
        </Space>
      ),
    },
    ...(!isEdit ? [{
      key: 'import',
      label: 'Import hàng loạt',
      children: (
        <div style={{ paddingTop: 8 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Kéo thả nhiều file .zip để import nhiều profile cùng lúc.
          </Typography.Text>
          <Upload.Dragger
            multiple
            accept=".zip"
            fileList={importFiles}
            beforeUpload={() => false}
            onChange={({ fileList }) => setImportFiles(fileList)}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả file .zip vào đây</p>
            <p className="ant-upload-hint">Hỗ trợ nhiều file cùng lúc</p>
          </Upload.Dragger>
          {importFiles.length > 0 && (
            <Button
              type="primary"
              loading={importing}
              style={{ marginTop: 12 }}
              onClick={() => void handleBulkImport()}
            >
              Import {importFiles.length} file
            </Button>
          )}
        </div>
      ),
    }] : []),
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Drawer
      title={isEdit ? 'Chỉnh sửa hồ sơ' : 'Tạo hồ sơ mới'}
      width={760}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            {isEdit ? 'Lưu' : 'Tạo'}
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" tabBarGutter={8} />
      )}
    </Drawer>
  );
};

export default ProfileForm;
