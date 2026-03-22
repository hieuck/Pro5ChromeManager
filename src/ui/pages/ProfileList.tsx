import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Button, Space, Tag, Badge, Input, Select, Tooltip,
  Popconfirm, message, Typography, Row, Col, Empty, Modal,
} from 'antd';
import type { InputRef } from 'antd';
import {
  PlusOutlined, PlayCircleOutlined, StopOutlined,
  DeleteOutlined, ExportOutlined, SearchOutlined,
  ReloadOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiClient } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../hooks/useTranslation';
import ProfileForm from '../components/ProfileForm';
import WelcomeScreen from '../components/WelcomeScreen';
import OnboardingWizard from '../components/OnboardingWizard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  name: string;
  notes?: string;
  group?: string;
  owner?: string | null;
  tags: string[];
  proxyId?: string;
  runtimeKey?: string;
  status: 'stopped' | 'running' | 'unreachable' | 'stale';
  lastUsedAt?: string;
  totalSessions: number;
  schemaVersion: number;
}

interface Instance {
  profileId: string;
  status: 'running' | 'unreachable' | 'stopped';
  port?: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, 'success' | 'processing' | 'error' | 'default'> = {
  running: 'success',
  unreachable: 'error',
  stopped: 'default',
  stale: 'default',
};

const SHORTCUTS = [
  { key: 'Ctrl+N', desc: 'Tạo profile mới' },
  { key: 'Ctrl+F', desc: 'Tìm kiếm' },
  { key: '↑ / ↓', desc: 'Di chuyển giữa các hàng' },
  { key: 'Enter', desc: 'Mở profile đang chọn' },
  { key: 'Escape', desc: 'Đóng drawer / modal' },
  { key: '?', desc: 'Hiện bảng phím tắt này' },
];

const ProfileList: React.FC = () => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [instances, setInstances] = useState<Record<string, Instance>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true); // default true to avoid flash
  const [wizardOpen, setWizardOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const searchRef = useRef<InputRef>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<Profile[]>('/api/profiles');
    if (res.success) setProfiles(res.data);
    setLoading(false);
  }, []);

  const fetchInstances = useCallback(async () => {
    const res = await apiClient.get<Instance[]>('/api/instances');
    if (res.success) {
      const map: Record<string, Instance> = {};
      for (const inst of res.data) map[inst.profileId] = inst;
      setInstances(map);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await apiClient.get<{ onboardingCompleted: boolean }>('/api/config');
    if (res.success) setOnboardingCompleted(res.data.onboardingCompleted);
  }, []);

  useEffect(() => {
    void fetchProfiles();
    void fetchInstances();
    void fetchConfig();
  }, [fetchProfiles, fetchInstances, fetchConfig]);

  // ─── WebSocket real-time updates ────────────────────────────────────────────

  useWebSocket((event) => {
    if (
      event.type === 'instance:started' ||
      event.type === 'instance:stopped' ||
      event.type === 'instance:status-changed'
    ) {
      void fetchInstances();
    }
  });

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleStart(profileId: string): Promise<void> {
    const res = await apiClient.post(`/api/profiles/${profileId}/start`);
    if (!res.success) void message.error(res.error);
    else void fetchInstances();
  }

  async function handleStop(profileId: string): Promise<void> {
    const res = await apiClient.post(`/api/profiles/${profileId}/stop`);
    if (!res.success) void message.error(res.error);
    else void fetchInstances();
  }

  async function handleDelete(profileId: string): Promise<void> {
    const res = await apiClient.delete(`/api/profiles/${profileId}`);
    if (!res.success) void message.error(res.error);
    else {
      void message.success('Đã xóa hồ sơ');
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    }
  }

  async function handleExport(profileId: string): Promise<void> {
    window.open(`http://127.0.0.1:3210/api/profiles/${profileId}/export`, '_blank');
  }

  async function handleBulkStart(): Promise<void> {
    await Promise.all(selectedIds.map((id) => handleStart(id)));
    setSelectedIds([]);
  }

  async function handleBulkStop(): Promise<void> {
    await Promise.all(selectedIds.map((id) => handleStop(id)));
    setSelectedIds([]);
  }

  async function handleBulkDelete(): Promise<void> {
    await Promise.all(selectedIds.map((id) => handleDelete(id)));
    setSelectedIds([]);
  }

  async function completeOnboarding(): Promise<void> {
    await apiClient.put('/api/config', { onboardingCompleted: true });
    setOnboardingCompleted(true);
  }

  function openCreate(): void {
    setEditingId(undefined);
    setDrawerOpen(true);
  }

  function openEdit(id: string): void {
    setEditingId(id);
    setDrawerOpen(true);
  }

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); openCreate(); return; }
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); return; }

      if (isInput) return; // don't intercept arrow/escape when typing

      if (e.key === '?') { setShortcutsOpen(true); return; }

      if (e.key === 'Escape') {
        if (drawerOpen) { setDrawerOpen(false); return; }
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        openEdit(filtered[highlightedIndex].id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, shortcutsOpen, highlightedIndex]);

  // ─── Filtered data ──────────────────────────────────────────────────────────

  const groups = profiles.map((p) => p.group).filter((g): g is string => Boolean(g)).filter((g, i, arr) => arr.indexOf(g) === i);

  const filtered = profiles.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.notes ?? '').toLowerCase().includes(search.toLowerCase());
    const matchGroup = !filterGroup || p.group === filterGroup;
    const matchStatus = !filterStatus || (instances[p.id]?.status ?? 'stopped') === filterStatus;
    return matchSearch && matchGroup && matchStatus;
  });

  // Reset highlight when filter changes
  useEffect(() => { setHighlightedIndex(-1); }, [search, filterGroup, filterStatus]);

  // ─── Show WelcomeScreen / OnboardingWizard ──────────────────────────────────

  if (!loading && profiles.length === 0 && !onboardingCompleted) {
    return (
      <>
        <WelcomeScreen
          onCreateProfile={() => { void completeOnboarding(); setWizardOpen(true); }}
          onSkip={() => void completeOnboarding()}
        />
        <OnboardingWizard
          open={wizardOpen}
          onFinish={() => { setWizardOpen(false); void fetchProfiles(); }}
        />
      </>
    );
  }

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns: ColumnsType<Profile> = [
    {
      title: t.common.name,
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openEdit(record.id)}>
          {name}
        </Button>
      ),
    },
    {
      title: t.common.status,
      key: 'status',
      width: 120,
      render: (_, record) => {
        const status = instances[record.id]?.status ?? 'stopped';
        return (
          <Badge
            status={STATUS_BADGE[status] ?? 'default'}
            text={t.profile[status as keyof typeof t.profile] ?? status}
          />
        );
      },
    },
    {
      title: t.profile.proxy,
      dataIndex: 'proxyId',
      key: 'proxy',
      width: 120,
      render: (proxyId?: string) => proxyId
        ? <Tag color="blue">{proxyId.slice(0, 8)}</Tag>
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: t.common.tags,
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>),
    },
    {
      title: 'Owner',
      dataIndex: 'owner',
      key: 'owner',
      width: 120,
      render: (owner?: string | null) => owner
        ? <Tag color="purple">{owner}</Tag>
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: t.profile.lastUsed,
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 140,
      render: (v?: string) => v
        ? new Date(v).toLocaleDateString('vi-VN')
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: t.common.actions,
      key: 'actions',
      width: 160,
      render: (_, record) => {
        const isRunning = instances[record.id]?.status === 'running';
        return (
          <Space size={4}>
            {isRunning ? (
              <Tooltip title={t.profile.stopProfile}>
                <Button
                  size="small" danger icon={<StopOutlined />}
                  onClick={() => void handleStop(record.id)}
                />
              </Tooltip>
            ) : (
              <Tooltip title={t.profile.startProfile}>
                <Button
                  size="small" type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => void handleStart(record.id)}
                />
              </Tooltip>
            )}
            <Tooltip title={t.profile.exportProfile}>
              <Button
                size="small" icon={<ExportOutlined />}
                onClick={() => void handleExport(record.id)}
              />
            </Tooltip>
            <Popconfirm
              title={t.profile.deleteConfirm}
              onConfirm={() => void handleDelete(record.id)}
              okText={t.common.yes}
              cancelText={t.common.no}
            >
              <Tooltip title={t.common.delete}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24 }}>
      {/* Toolbar */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
        <Col flex="auto">
          <Space wrap>
            <Input
              ref={searchRef}
              placeholder={`${t.common.search} (Ctrl+F)`}
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Select
              placeholder={t.common.group}
              allowClear
              value={filterGroup}
              onChange={setFilterGroup}
              style={{ width: 140 }}
              options={groups.map((g) => ({ label: g, value: g }))}
            />
            <Select
              placeholder={t.common.status}
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 140 }}
              options={[
                { label: t.profile.running, value: 'running' },
                { label: t.profile.stopped, value: 'stopped' },
                { label: t.profile.unreachable, value: 'unreachable' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { void fetchProfiles(); void fetchInstances(); }} />
            <Tooltip title="Phím tắt (?)">
              <Button icon={<QuestionCircleOutlined />} onClick={() => setShortcutsOpen(true)} />
            </Tooltip>
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
          >
            {t.profile.newProfile} (Ctrl+N)
          </Button>
        </Col>
      </Row>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <Row style={{ marginBottom: 12 }}>
          <Space>
            <Typography.Text type="secondary">Đã chọn {selectedIds.length}:</Typography.Text>
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => void handleBulkStart()}>
              {t.profile.bulkStart}
            </Button>
            <Button size="small" danger icon={<StopOutlined />} onClick={() => void handleBulkStop()}>
              {t.profile.bulkStop}
            </Button>
            <Popconfirm
              title={`Xóa ${selectedIds.length} hồ sơ đã chọn?`}
              onConfirm={() => void handleBulkDelete()}
              okText={t.common.yes}
              cancelText={t.common.no}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>{t.profile.bulkDelete}</Button>
            </Popconfirm>
          </Space>
        </Row>
      )}

      {/* Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
        }}
        rowClassName={(_, index) => index === highlightedIndex ? 'ant-table-row-selected' : ''}
        onRow={(record, index) => ({
          onClick: () => setHighlightedIndex(index ?? -1),
          onDoubleClick: () => openEdit(record.id),
        })}
        locale={{
          emptyText: (
            <Empty
              description={t.profile.noProfiles}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        size="small"
      />

      {/* Profile Form Drawer */}
      <ProfileForm
        open={drawerOpen}
        profileId={editingId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); void fetchProfiles(); }}
      />

      {/* Keyboard Shortcuts Modal */}
      <Modal
        title="Phím tắt"
        open={shortcutsOpen}
        onCancel={() => setShortcutsOpen(false)}
        footer={null}
        width={400}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {SHORTCUTS.map(({ key, desc }) => (
              <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 0', width: 120 }}>
                  <Tag style={{ fontFamily: 'monospace' }}>{key}</Tag>
                </td>
                <td style={{ padding: '8px 0' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </div>
  );
};

export default ProfileList;
