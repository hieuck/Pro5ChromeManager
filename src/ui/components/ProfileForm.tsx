import React, { useEffect, useState } from 'react';
import {
  Drawer, Form, Input, Select, Tabs, Button, Space,
  message, Spin, Table, Typography, Upload,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { apiClient } from '../api/client';
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
  fingerprint: FingerprintConfig;
  lastUsedAt: string | null;
  totalSessions: number;
}

interface ActivitySession {
  profileId: string;
  startedAt: string;
  stoppedAt?: string;
  durationMs?: number;
}

interface Runtime {
  key: string;
  name: string;
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
  const [activity, setActivity] = useState<ActivitySession[]>([]);
  const [activeTab, setActiveTab] = useState('general');
  const [importFiles, setImportFiles] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);

  const isEdit = !!profileId;

  // ─── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setActiveTab('general');
    setImportFiles([]);

    void apiClient.get<Runtime[]>('/api/runtimes').then((res) => {
      if (res.success) setRuntimes(res.data);
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
        });
        setFingerprint(p.fingerprint);
        setProxyId(p.proxy?.id ?? null);
      });

      void apiClient.get<ActivitySession[]>(`/api/profiles/${profileId}/activity`).then((res) => {
        if (res.success) setActivity(res.data);
      });
    } else {
      form.resetFields();
      setFingerprint(undefined);
      setProxyId(null);
      setActivity([]);
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

    setSaving(true);
    const payload = {
      name: values.name,
      notes: values.notes ?? '',
      tags: values.tags ?? [],
      group: values.group ?? null,
      runtime: values.runtime ?? 'auto',
      proxyId,
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
        const res = await fetch('http://127.0.0.1:3210/api/profiles/import', {
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
                  label: `${r.name}${r.available ? '' : ' (không khả dụng)'}`,
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
      key: 'fingerprint',
      label: 'Dấu vân tay',
      children: (
        <FingerprintEditor value={fingerprint} onChange={setFingerprint} />
      ),
    },
    {
      key: 'activity',
      label: 'Hoạt động',
      children: (
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
      width={600}
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
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      )}
    </Drawer>
  );
};

export default ProfileForm;
