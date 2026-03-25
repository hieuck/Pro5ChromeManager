import React, { useEffect, useState } from 'react';
import {
  Drawer, Form, Input, Select, Tabs, Button, Space,
  message, Spin, Table, Typography, Upload,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { TabsProps } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { apiClient, buildApiUrl } from '../../../api/client';
import { useTranslation } from '../../../shared/hooks/useTranslation';
import ProxySelector from './ProxySelector';
import FingerprintEditor from './FingerprintEditor';

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

interface ProfileBookmark {
  name: string;
  url: string;
  folder: string | null;
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

interface ProfileFormValues {
  name: string;
  notes?: string;
  tags?: string[];
  group?: string;
  runtime?: string;
  extensionIds?: string[];
  extensionCategories?: string[];
}

const BOOKMARK_PLACEHOLDER = `[
  {"name":"Google","url":"https://www.google.com","folder":"Daily"},
  {"name":"Docs","url":"https://docs.example.com","folder":null}
]`;

const COOKIE_PLACEHOLDER = '[{"name":"session","value":"abc","domain":".example.com","path":"/"}]';

function formatRuntimeOptionLabel(
  runtime: Runtime,
  unavailableSuffix: string,
): string {
  const baseLabel = runtime.label ?? runtime.name ?? runtime.key;
  return runtime.available ? baseLabel : `${baseLabel} (${unavailableSuffix})`;
}

function formatExtensionOptionLabel(
  extension: ExtensionRecord,
  disabledSuffix: string,
): string {
  const versionLabel = extension.version ? ` · v${extension.version}` : '';
  const statusLabel = extension.enabled ? '' : ` (${disabledSuffix})`;
  return `${extension.name}${versionLabel}${statusLabel}`;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ open, profileId, onClose, onSaved }) => {
  const { t, format } = useTranslation();
  const [form] = Form.useForm<ProfileFormValues>();
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

  const isEdit = Boolean(profileId);

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
        if (!res.success) {
          void message.error(res.error);
          return;
        }

        const profile = res.data;
        form.setFieldsValue({
          name: profile.name,
          notes: profile.notes,
          tags: profile.tags,
          group: profile.group ?? undefined,
          runtime: profile.runtime,
          extensionIds: profile.extensionIds ?? [],
          extensionCategories: [],
        });
        setBookmarkText(JSON.stringify(profile.bookmarks ?? [], null, 2));
        setFingerprint(profile.fingerprint);
        setProxyId(profile.proxy?.id ?? null);
      });

      void apiClient.get<ActivitySession[]>(`/api/profiles/${profileId}/activity`).then((res) => {
        if (res.success) setActivity(res.data);
      });

      setCookiesLoading(true);
      void apiClient.get<{ count: number; cookies: ProfileCookie[] }>(`/api/profiles/${profileId}/cookies`).then((res) => {
        setCookiesLoading(false);
        if (!res.success) return;
        setCookieCount(res.data.count);
        setCookieText(JSON.stringify(res.data.cookies, null, 2));
      });

      return;
    }

    form.resetFields();
    form.setFieldValue('extensionCategories', []);
    setFingerprint(undefined);
    setProxyId(null);
    setActivity([]);
    setBookmarkText('[]');
    setCookieText('[]');
    setCookieCount(0);
  }, [open, profileId, isEdit, form]);

  async function handleSave(): Promise<void> {
    let values: ProfileFormValues;
    try {
      values = await form.validateFields();
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
      void message.error(t.profile.invalidBookmarksJson);
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
      extensionIds: values.extensionIds ?? [],
      extensionCategories: values.extensionCategories ?? [],
      bookmarks: parsedBookmarks,
      fingerprint,
    };

    const res = isEdit && profileId
      ? await apiClient.put(`/api/profiles/${profileId}`, payload)
      : await apiClient.post('/api/profiles', payload);

    setSaving(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }

    void message.success(isEdit ? t.profile.updatedProfile : t.profile.createdProfile);
    onSaved();
  }

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
        const response = await fetch(buildApiUrl('/api/profiles/import'), {
          method: 'POST',
          body: formData,
        });
        const json = await response.json() as { success: boolean };
        if (json.success) successCount += 1;
        else failCount += 1;
      } catch {
        failCount += 1;
      }
    }

    setImporting(false);

    if (successCount > 0) {
      void message.success(format(t.profile.importedProfiles, { total: successCount }));
    }
    if (failCount > 0) {
      void message.warning(format(t.profile.importFailedFiles, { total: failCount }));
    }
    if (successCount > 0) {
      setImportFiles([]);
      onSaved();
    }
  }

  function applyBundleSelection(selectedCategories: string[]): void {
    const selectedIds = new Set<string>(form.getFieldValue('extensionIds') ?? []);

    for (const category of selectedCategories) {
      const bundle = extensionBundles.find((item) => item.key === category);
      if (!bundle) continue;
      for (const extensionId of bundle.extensionIds) {
        selectedIds.add(extensionId);
      }
    }

    form.setFieldValue('extensionCategories', selectedCategories);
    form.setFieldValue('extensionIds', Array.from(selectedIds));
  }

  async function handleImportCookies(): Promise<void> {
    if (!profileId) {
      void message.warning(t.profile.saveBeforeImportCookies);
      return;
    }

    let parsed: ProfileCookie[];
    try {
      parsed = JSON.parse(cookieText) as ProfileCookie[];
    } catch {
      void message.error(t.profile.invalidCookiesJson);
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      void message.warning(t.profile.cookiesNeedAtLeastOne);
      return;
    }

    setCookiesSaving(true);
    const res = await apiClient.post<{ count: number; cookies: ProfileCookie[] }>(
      `/api/profiles/${profileId}/cookies/import`,
      { cookies: parsed },
    );
    setCookiesSaving(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setCookieCount(res.data.count);
    setCookieText(JSON.stringify(res.data.cookies, null, 2));
    void message.success(format(t.profile.importedCookies, { total: res.data.count }));
  }

  async function handleClearCookies(): Promise<void> {
    if (!profileId) return;

    setCookiesSaving(true);
    const res = await apiClient.delete(`/api/profiles/${profileId}/cookies`);
    setCookiesSaving(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    setCookieText('[]');
    setCookieCount(0);
    void message.success(t.profile.clearedCookies);
  }

  function handleExportCookies(): void {
    if (!profileId) return;
    window.open(buildApiUrl(`/api/profiles/${profileId}/cookies/export`), '_blank');
  }

  const tabItems: TabsProps['items'] = [
    {
      key: 'general',
      label: t.profile.tabGeneral,
      children: (
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t.profile.nameLabel}
            rules={[{ required: true, message: t.profile.nameRequired }]}
          >
            <Input placeholder={t.profile.namePlaceholder} />
          </Form.Item>
          <Form.Item name="notes" label={t.profile.notesLabel}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="group" label={t.profile.groupLabel}>
            <Input placeholder={t.profile.groupPlaceholder} />
          </Form.Item>
          <Form.Item name="tags" label={t.profile.tagsLabel}>
            <Select mode="tags" placeholder={t.profile.tagsPlaceholder} />
          </Form.Item>
          <Form.Item name="runtime" label={t.profile.runtime}>
            <Select
              placeholder={t.profile.runtimePlaceholder}
              options={[
                { label: t.profile.autoRuntime, value: 'auto' },
                ...runtimes.map((runtime) => ({
                  label: formatRuntimeOptionLabel(runtime, t.profile.unavailableSuffix),
                  value: runtime.key,
                  disabled: !runtime.available,
                })),
              ]}
            />
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'proxy',
      label: t.profile.tabProxy,
      children: (
        <div style={{ paddingTop: 8 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {t.profile.proxyHint}
          </Typography.Text>
          <ProxySelector value={proxyId} onChange={setProxyId} />
        </div>
      ),
    },
    {
      key: 'extensions',
      label: t.profile.tabExtensions,
      children: (
        <Form form={form} layout="vertical">
          <Form.Item name="extensionCategories" label={t.profile.extensionsBundleLabel}>
            <Select
              mode="multiple"
              placeholder={t.profile.extensionsBundlePlaceholder}
              options={extensionBundles.map((bundle) => ({
                label: `${bundle.label} · ${bundle.extensionCount} extension`,
                value: bundle.key,
              }))}
              onChange={applyBundleSelection}
            />
          </Form.Item>
          <Form.Item name="extensionIds" label={t.profile.extensionsAttachedLabel}>
            <Select
              mode="multiple"
              placeholder={t.profile.extensionsAttachedPlaceholder}
              options={extensions.map((extension) => ({
                label: formatExtensionOptionLabel(extension, t.profile.disabledSuffix),
                value: extension.id,
                disabled: !extension.enabled,
              }))}
            />
          </Form.Item>
          <Typography.Text type="secondary">
            {t.profile.extensionsHint}
          </Typography.Text>
        </Form>
      ),
    },
    {
      key: 'fingerprint',
      label: t.profile.tabFingerprint,
      children: <FingerprintEditor value={fingerprint} onChange={setFingerprint} />,
    },
    {
      key: 'bookmarks',
      label: t.profile.tabBookmarks,
      children: (
        <div style={{ paddingTop: 8 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {t.profile.bookmarkHint}
          </Typography.Text>
          <Input.TextArea
            rows={12}
            value={bookmarkText}
            onChange={(event) => setBookmarkText(event.target.value)}
            placeholder={BOOKMARK_PLACEHOLDER}
          />
        </div>
      ),
    },
    {
      key: 'activity',
      label: t.profile.tabActivity,
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Table<ActivitySession>
            size="small"
            dataSource={activity}
            rowKey={(record) => record.startedAt}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: t.profile.activityEmpty }}
            columns={[
              {
                title: t.profile.activityStartedAt,
                dataIndex: 'startedAt',
                render: (value: string) => new Date(value).toLocaleString('vi-VN'),
              },
              {
                title: t.profile.activityStoppedAt,
                dataIndex: 'stoppedAt',
                render: (value?: string) => value ? new Date(value).toLocaleString('vi-VN') : '—',
              },
              {
                title: t.profile.activityDuration,
                dataIndex: 'durationMs',
                render: (value?: number) => value ? `${Math.round(value / 1000)}s` : '—',
              },
            ]}
          />
          {isEdit ? (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                {t.profile.cookiesTitle}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                {t.profile.cookiesHint}
              </Typography.Text>
              <Typography.Text style={{ display: 'block', marginBottom: 12 }}>
                {format(t.profile.cookiesCount, { total: cookieCount })}
              </Typography.Text>
              <Input.TextArea
                rows={12}
                value={cookieText}
                onChange={(event) => setCookieText(event.target.value)}
                placeholder={COOKIE_PLACEHOLDER}
              />
              <Space style={{ marginTop: 12 }}>
                <Button loading={cookiesSaving} type="primary" onClick={() => void handleImportCookies()}>
                  {t.profile.cookiesImport}
                </Button>
                <Button
                  loading={cookiesSaving || cookiesLoading}
                  onClick={handleExportCookies}
                  disabled={cookieCount === 0}
                >
                  {t.profile.cookiesExport}
                </Button>
                <Button
                  danger
                  loading={cookiesSaving}
                  onClick={() => void handleClearCookies()}
                  disabled={cookieCount === 0}
                >
                  {t.profile.cookiesClear}
                </Button>
              </Space>
            </div>
          ) : null}
        </Space>
      ),
    },
    ...(!isEdit ? [{
      key: 'import',
      label: t.profile.tabBulkImport,
      children: (
        <div style={{ paddingTop: 8 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {t.profile.bulkImportHint}
          </Typography.Text>
          <Upload.Dragger
            multiple
            accept=".zip"
            fileList={importFiles}
            beforeUpload={() => false}
            onChange={({ fileList }) => setImportFiles(fileList)}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{t.profile.bulkImportText}</p>
            <p className="ant-upload-hint">{t.profile.bulkImportUploadHint}</p>
          </Upload.Dragger>
          {importFiles.length > 0 ? (
            <Button
              type="primary"
              loading={importing}
              style={{ marginTop: 12 }}
              onClick={() => void handleBulkImport()}
            >
              {format(t.profile.bulkImportAction, { total: importFiles.length })}
            </Button>
          ) : null}
        </div>
      ),
    }] : []),
  ];

  return (
    <Drawer
      title={isEdit ? t.profile.editProfile : t.profile.createProfileTitle}
      width={760}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={(
        <Space>
          <Button onClick={onClose}>{t.profile.cancel}</Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            {isEdit ? t.profile.save : t.profile.create}
          </Button>
        </Space>
      )}
    >
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="small"
          tabBarGutter={8}
        />
      )}
    </Drawer>
  );
};

export default ProfileForm;
