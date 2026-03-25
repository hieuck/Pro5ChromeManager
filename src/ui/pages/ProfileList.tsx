import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { InputRef } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RedoOutlined,
  SearchOutlined,
  StopOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { buildApiUrl } from '../api/client';
import type { ColumnsType } from 'antd/es/table';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import ProfileForm from '../components/ProfileForm';
import OnboardingWizard from '../components/OnboardingWizard';
import WelcomeScreen from '../components/WelcomeScreen';
import { useTranslation } from '../hooks/useTranslation';
import { useWebSocket } from '../hooks/useWebSocket';
import { finalizeOnboarding } from '../utils/onboarding';
import { mergeBulkExtensionSelection } from '../utils/bulkExtensionSelection';
import { parseBulkProfileDrafts } from '../utils/bulkProfiles';

interface Profile {
  id: string;
  name: string;
  notes?: string;
  group?: string | null;
  owner?: string | null;
  tags: string[];
  proxy?: ProxyOption | null;
  proxyId?: string;
  runtime?: string;
  runtimeKey?: string;
  extensionIds: string[];
  status: 'stopped' | 'running' | 'unreachable' | 'stale';
  lastUsedAt?: string | null;
  totalSessions: number;
  schemaVersion: number;
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

interface ProxyOption {
  id: string;
  label?: string;
  type: string;
  host: string;
  port: number;
  lastCheckAt?: string;
  lastCheckStatus?: 'healthy' | 'failing';
  lastCheckIp?: string;
  lastCheckTimezone?: string | null;
  lastCheckError?: string;
}

interface Instance {
  profileId: string;
  status: 'running' | 'unreachable' | 'stopped';
  port?: number;
}

interface RuntimeOption {
  key: string;
  available: boolean;
  label?: string;
  name?: string;
}

interface BulkCreateResponse {
  total: number;
  profiles: Profile[];
}

interface BulkUpdateResponse {
  total: number;
  profiles: Profile[];
}

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

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

const ProfileList: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<ProxyOption[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeOption[]>([]);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [extensionBundles, setExtensionBundles] = useState<ExtensionBundle[]>([]);
  const [instances, setInstances] = useState<Record<string, Instance>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkProxySelection, setBulkProxySelection] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterTag, setFilterTag] = useState<string | undefined>();
  const [filterOwner, setFilterOwner] = useState<string | undefined>();
  const [filterProxyHealth, setFilterProxyHealth] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkCreateText, setBulkCreateText] = useState('');
  const [bulkCreateRuntime, setBulkCreateRuntime] = useState<string>('auto');
  const [bulkCreateProxyId, setBulkCreateProxyId] = useState<string | undefined>();
  const [bulkCreating, setBulkCreating] = useState(false);
  const [importPackagesOpen, setImportPackagesOpen] = useState(false);
  const [importPackageFiles, setImportPackageFiles] = useState<UploadFile[]>([]);
  const [importingPackages, setImportingPackages] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditGroup, setBulkEditGroup] = useState('');
  const [bulkEditClearGroup, setBulkEditClearGroup] = useState(false);
  const [bulkEditOwner, setBulkEditOwner] = useState('');
  const [bulkEditClearOwner, setBulkEditClearOwner] = useState(false);
  const [bulkEditRuntime, setBulkEditRuntime] = useState<string | undefined>();
  const [bulkEditAddTags, setBulkEditAddTags] = useState<string[]>([]);
  const [bulkEditRemoveTags, setBulkEditRemoveTags] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkExtensionsOpen, setBulkExtensionsOpen] = useState(false);
  const [bulkExtensionIds, setBulkExtensionIds] = useState<string[]>([]);
  const [bulkExtensionCategories, setBulkExtensionCategories] = useState<string[]>([]);
  const [bulkApplyingExtensions, setBulkApplyingExtensions] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [bulkProxyTesting, setBulkProxyTesting] = useState(false);
  const searchRef = useRef<InputRef>(null);

  const getProfileProxyId = useCallback((profile: Profile): string | undefined => (
    profile.proxyId ?? profile.proxy?.id
  ), []);

  const getProfileStatus = useCallback((profileId: string): Profile['status'] => {
    return instances[profileId]?.status ?? 'stopped';
  }, [instances]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<Profile[]>('/api/profiles');
    if (res.success) {
      setProfiles(res.data);
    }
    setLoading(false);
  }, []);

  const fetchProxies = useCallback(async () => {
    const res = await apiClient.get<ProxyOption[]>('/api/proxies');
    if (res.success) {
      setProxies(res.data);
    }
  }, []);

  const fetchInstances = useCallback(async () => {
    const res = await apiClient.get<Instance[]>('/api/instances');
    if (res.success) {
      const nextInstances: Record<string, Instance> = {};
      for (const instance of res.data) {
        nextInstances[instance.profileId] = instance;
      }
      setInstances(nextInstances);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await apiClient.get<{ onboardingCompleted: boolean }>('/api/config');
    if (res.success) {
      setOnboardingCompleted(res.data.onboardingCompleted);
    }
  }, []);

  const fetchExtensions = useCallback(async () => {
    const [extensionRes, bundleRes] = await Promise.all([
      apiClient.get<ExtensionRecord[]>('/api/extensions'),
      apiClient.get<ExtensionBundle[]>('/api/extensions/bundles'),
    ]);

    if (extensionRes.success) {
      setExtensions(extensionRes.data);
    }

    if (bundleRes.success) {
      setExtensionBundles(bundleRes.data);
    }
  }, []);

  const fetchRuntimes = useCallback(async (): Promise<RuntimeOption[]> => {
    const res = await apiClient.get<RuntimeOption[]>('/api/runtimes');
    if (!res.success) {
      return [];
    }

    setRuntimes(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    void fetchProfiles();
    void fetchProxies();
    void fetchInstances();
    void fetchConfig();
    void fetchRuntimes();
    void fetchExtensions();
  }, [fetchConfig, fetchExtensions, fetchInstances, fetchProfiles, fetchProxies, fetchRuntimes]);

  useEffect(() => {
    const state = location.state as { openCreate?: boolean } | null;
    if (!state?.openCreate) {
      return;
    }

    void (async () => {
      const runtimeList = await fetchRuntimes();
      const hasAvailableRuntime = runtimeList.some((runtime) => runtime.available);
      if (!hasAvailableRuntime) {
        void message.info(t.dashboard.runtimeActionHint);
        setWizardOpen(true);
      } else {
        setEditingId(undefined);
        setDrawerOpen(true);
      }

      navigate(location.pathname, { replace: true, state: null });
    })();
  }, [fetchRuntimes, location.pathname, location.state, navigate, t.dashboard.runtimeActionHint]);

  useWebSocket((event) => {
    if (
      event.type === 'instance:started'
      || event.type === 'instance:stopped'
      || event.type === 'instance:status-changed'
    ) {
      void fetchInstances();
      void fetchProfiles();
    }
  });

  async function handleStart(profileId: string): Promise<void> {
    const res = await apiClient.post(`/api/profiles/${profileId}/start`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void fetchInstances();
    void fetchProfiles();
  }

  function getProfilesWithFailingProxy(ids: string[]): Profile[] {
    return ids
      .map((id) => profiles.find((profile) => profile.id === id))
      .filter((profile): profile is Profile => Boolean(profile))
      .filter((profile) => profile.proxy?.lastCheckStatus === 'failing');
  }

  async function confirmAndStartProfiles(ids: string[]): Promise<void> {
    const failingProxyProfiles = getProfilesWithFailingProxy(ids);
    if (!failingProxyProfiles.length) {
      await Promise.all(ids.map(async (id) => handleStart(id)));
      return;
    }

    Modal.confirm({
      title: 'Proxy cần kiểm tra trước khi mở',
      icon: <QuestionCircleOutlined />,
      okText: 'Vẫn khởi động',
      cancelText: 'Kiểm tra lại proxy',
      content: (
        <Space direction="vertical" size={4}>
          <Typography.Text>
            {`Có ${failingProxyProfiles.length} hồ sơ đang dùng proxy ở trạng thái Needs check.`}
          </Typography.Text>
          <Typography.Text type="secondary">
            {failingProxyProfiles.slice(0, 3).map((profile) => profile.name).join(', ')}
            {failingProxyProfiles.length > 3 ? '...' : ''}
          </Typography.Text>
        </Space>
      ),
      onOk: async () => {
        await Promise.all(ids.map(async (id) => handleStart(id)));
      },
      onCancel: async () => {
        const failingProxyIds = Array.from(new Set(
          failingProxyProfiles
            .map((profile) => getProfileProxyId(profile))
            .filter((proxyId): proxyId is string => Boolean(proxyId)),
        ));

        if (!failingProxyIds.length) {
          return;
        }

        const res = await apiClient.post<{
          total: number;
          healthy: number;
          failing: number;
        }>('/api/proxies/test-bulk', { ids: failingProxyIds });

        if (!res.success) {
          void message.error(res.error);
          return;
        }

        void message.success(`Đã test ${res.data.total} proxy · OK ${res.data.healthy} · FAIL ${res.data.failing}`);
        await fetchProfiles();
        await fetchProxies();
      },
    });
  }

  async function handleStop(profileId: string): Promise<void> {
    const res = await apiClient.post(`/api/profiles/${profileId}/stop`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void fetchInstances();
  }

  async function handleRestart(profileId: string): Promise<void> {
    const res = await apiClient.post(`/api/profiles/${profileId}/restart`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void fetchInstances();
    void fetchProfiles();
  }

  async function handleDelete(profileId: string): Promise<void> {
    const res = await apiClient.delete(`/api/profiles/${profileId}`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success('Đã xóa hồ sơ');
    setProfiles((current) => current.filter((profile) => profile.id !== profileId));
    setSelectedIds((current) => current.filter((id) => id !== profileId));
  }

  async function handleClone(profile: Profile): Promise<void> {
    const res = await apiClient.post<Profile>(`/api/profiles/${profile.id}/clone`, {
      name: `${profile.name} Copy`,
    });
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.profile.duplicateSuccess);
    void fetchProfiles();
  }

  function handleExport(profileId: string): void {
    window.open(buildApiUrl(`/api/profiles/${profileId}/export`), '_blank');
  }

  async function handleBulkStart(): Promise<void> {
    await confirmAndStartProfiles(selectedIds);
    setSelectedIds([]);
  }

  async function handleBulkStop(): Promise<void> {
    await Promise.all(selectedIds.map(async (id) => handleStop(id)));
    setSelectedIds([]);
  }

  async function handleBulkDelete(): Promise<void> {
    await Promise.all(selectedIds.map(async (id) => handleDelete(id)));
    setSelectedIds([]);
  }

  async function handleBulkRestart(): Promise<void> {
    const results = await Promise.all(selectedIds.map(async (id) => apiClient.post(`/api/profiles/${id}/restart`)));
    const failed = results.find((result) => !result.success);
    if (failed) {
      void message.error(failed.error);
      return;
    }
    void message.success(`Đã restart ${selectedIds.length} hồ sơ`);
    setSelectedIds([]);
    void fetchInstances();
    void fetchProfiles();
  }

  function selectFilteredProfiles(): void {
    setSelectedIds(filtered.map((profile) => profile.id));
  }

  function selectFilteredRunningProfiles(): void {
    setSelectedIds(
      filtered
        .filter((profile) => getProfileStatus(profile.id) === 'running')
        .map((profile) => profile.id),
    );
  }

  function clearSelection(): void {
    setSelectedIds([]);
  }

  function openBulkCreate(): void {
    setBulkCreateText('');
    setBulkCreateRuntime('auto');
    setBulkCreateProxyId(undefined);
    setBulkCreateOpen(true);
  }

  function openImportPackages(): void {
    setImportPackageFiles([]);
    setImportPackagesOpen(true);
  }

  function openBulkEdit(): void {
    setBulkEditGroup('');
    setBulkEditClearGroup(false);
    setBulkEditOwner('');
    setBulkEditClearOwner(false);
    setBulkEditRuntime(undefined);
    setBulkEditAddTags([]);
    setBulkEditRemoveTags([]);
    setBulkEditOpen(true);
  }

  function openBulkExtensions(): void {
    setBulkExtensionIds([]);
    setBulkExtensionCategories([]);
    setBulkExtensionsOpen(true);
  }

  async function handleBulkCreateProfiles(): Promise<void> {
    const entries = parseBulkProfileDrafts(bulkCreateText);
    if (entries.length === 0) {
      void message.warning('Hãy nhập ít nhất một dòng profile hợp lệ');
      return;
    }

    setBulkCreating(true);
    const res = await apiClient.post<BulkCreateResponse>('/api/profiles/bulk-create', {
      entries,
      runtime: bulkCreateRuntime,
      proxyId: bulkCreateProxyId,
    });
    setBulkCreating(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    void message.success(`Đã tạo ${res.data.total} hồ sơ`);
    setBulkCreateOpen(false);
    setBulkCreateText('');
    setBulkCreateRuntime('auto');
    setBulkCreateProxyId(undefined);
    void fetchProfiles();
  }

  async function handleImportProfilePackages(): Promise<void> {
    const filesToImport = importPackageFiles
      .map((file) => (
        file.originFileObj
        ?? (typeof File !== 'undefined' && file instanceof File ? file : null)
      ))
      .filter((file): file is File => Boolean(file));

    if (filesToImport.length === 0) {
      void message.warning('Hãy chọn ít nhất một gói profile `.zip` để import');
      return;
    }

    setImportingPackages(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of filesToImport) {
      try {
        const buffer = await file.arrayBuffer();
        const response = await fetch(buildApiUrl('/api/profiles/import-package'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Pro5-File-Name': encodeURIComponent(file.name),
          },
          body: buffer,
        });
        const json = await response.json() as { success: boolean; error?: string };
        if (json.success) {
          successCount += 1;
        } else {
          failCount += 1;
        }
      } catch {
        failCount += 1;
      }
    }

    setImportingPackages(false);

    if (successCount > 0) {
      void message.success(`Đã import ${successCount} gói profile`);
      setImportPackagesOpen(false);
      setImportPackageFiles([]);
      void fetchProfiles();
    }

    if (failCount > 0) {
      void message.warning(`${failCount} gói profile import thất bại`);
    }
  }

  async function handleBulkEditProfiles(): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (bulkEditGroup.trim()) {
      payload['group'] = bulkEditGroup.trim();
    }
    if (bulkEditOwner.trim()) {
      payload['owner'] = bulkEditOwner.trim();
    }
    if (bulkEditRuntime) {
      payload['runtime'] = bulkEditRuntime;
    }

    if (Object.keys(payload).length === 0) {
      void message.warning('Hãy nhập ít nhất một thay đổi để áp dụng');
      return;
    }

    setBulkEditing(true);
    const results = await Promise.all(selectedIds.map(async (id) => apiClient.put(`/api/profiles/${id}`, payload)));
    setBulkEditing(false);
    const failed = results.find((result) => !result.success);
    if (failed) {
      void message.error(failed.error);
      return;
    }

    void message.success(`Đã cập nhật ${selectedIds.length} hồ sơ`);
    setBulkEditOpen(false);
    setSelectedIds([]);
    void fetchProfiles();
  }

  async function handleBulkApplyExtensions(): Promise<void> {
    if (bulkExtensionIds.length === 0 && bulkExtensionCategories.length === 0) {
      void message.warning('Hãy chọn ít nhất một extension hoặc bundle để áp dụng');
      return;
    }

    const selectedProfiles = selectedIds
      .map((id) => profiles.find((profile) => profile.id === id))
      .filter((profile): profile is Profile => Boolean(profile));

    if (selectedProfiles.length === 0) {
      void message.warning('Không tìm thấy hồ sơ nào để cập nhật');
      return;
    }

    setBulkApplyingExtensions(true);
    const results = await Promise.all(selectedProfiles.map(async (profile) => apiClient.put(`/api/profiles/${profile.id}`, {
      extensionIds: mergeBulkExtensionSelection({
        currentExtensionIds: profile.extensionIds ?? [],
        selectedExtensionIds: bulkExtensionIds,
        selectedCategories: bulkExtensionCategories,
        bundles: extensionBundles,
      }),
    })));
    setBulkApplyingExtensions(false);

    const failed = results.find((result) => !result.success);
    if (failed) {
      void message.error(failed.error);
      return;
    }

    void message.success(`Đã gán extension cho ${selectedProfiles.length} hồ sơ`);
    setBulkExtensionsOpen(false);
    setBulkExtensionIds([]);
    setBulkExtensionCategories([]);
    setSelectedIds([]);
    void fetchProfiles();
  }

  async function handleBulkAssignProxy(): Promise<void> {
    if (!selectedIds.length || bulkProxySelection === undefined) {
      return;
    }

    const proxyId = bulkProxySelection === '__NONE__' ? null : bulkProxySelection;
    const results = await Promise.all(
      selectedIds.map(async (id) => apiClient.put(`/api/profiles/${id}`, { proxyId })),
    );
    const failed = results.find((result) => !result.success);
    if (failed) {
      void message.error(failed.error);
      return;
    }

    void message.success(
      proxyId
        ? `Đã gán proxy cho ${selectedIds.length} hồ sơ`
        : `Đã gỡ proxy khỏi ${selectedIds.length} hồ sơ`,
    );
    setBulkProxySelection(undefined);
    setSelectedIds([]);
    await fetchProfiles();
  }

  async function handleBulkTestSelectedProxies(): Promise<void> {
    const proxyIds = Array.from(new Set(
      selectedIds
        .map((id) => profiles.find((profile) => profile.id === id))
        .map((profile) => (profile ? getProfileProxyId(profile) : undefined))
        .filter((proxyId): proxyId is string => Boolean(proxyId)),
    ));

    if (!proxyIds.length) {
      void message.warning('Các hồ sơ đã chọn chưa có proxy để test');
      return;
    }

    setBulkProxyTesting(true);
    const res = await apiClient.post<{
      total: number;
      healthy: number;
      failing: number;
    }>('/api/proxies/test-bulk', { ids: proxyIds });
    setBulkProxyTesting(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    void message.success(`Đã test ${res.data.total} proxy · OK ${res.data.healthy} · FAIL ${res.data.failing}`);
    await fetchProfiles();
    await fetchProxies();
  }

  async function completeOnboarding(): Promise<void> {
    await finalizeOnboarding({
      status: 'skipped',
      currentStep: 0,
      skippedAt: new Date().toISOString(),
    });
    setOnboardingCompleted(true);
  }

  function openCreate(): void {
    void (async () => {
      const runtimeList = await fetchRuntimes();
      const hasAvailableRuntime = runtimeList.some((runtime) => runtime.available);
      if (!hasAvailableRuntime) {
        void message.info(t.dashboard.runtimeActionHint);
        setWizardOpen(true);
        return;
      }

      setEditingId(undefined);
      setDrawerOpen(true);
    })();
  }

  function openEdit(id: string): void {
    setEditingId(id);
    setDrawerOpen(true);
  }

  const groups = Array.from(new Set(
    profiles
      .map((profile) => profile.group)
      .filter((group): group is string => Boolean(group)),
  ));

  const owners = Array.from(new Set(
    profiles
      .map((profile) => profile.owner)
      .filter((owner): owner is string => Boolean(owner)),
  ));

  const tags = Array.from(new Set(
    profiles.flatMap((profile) => profile.tags ?? []),
  ));

  const filtered = profiles.filter((profile) => {
    const normalizedSearch = search.trim().toLowerCase();
    const status = getProfileStatus(profile.id);
    const proxyHealth = profile.proxy?.lastCheckStatus ?? 'none';
    const joinedTags = (profile.tags ?? []).join(' ').toLowerCase();
    const matchSearch = !normalizedSearch
      || profile.name.toLowerCase().includes(normalizedSearch)
      || (profile.notes ?? '').toLowerCase().includes(normalizedSearch)
      || (profile.group ?? '').toLowerCase().includes(normalizedSearch)
      || (profile.owner ?? '').toLowerCase().includes(normalizedSearch)
      || joinedTags.includes(normalizedSearch);

    const matchGroup = !filterGroup || profile.group === filterGroup;
    const matchStatus = !filterStatus || status === filterStatus;
    const matchTag = !filterTag || (profile.tags ?? []).includes(filterTag);
    const matchOwner = !filterOwner || profile.owner === filterOwner;
    const matchProxyHealth = !filterProxyHealth || proxyHealth === filterProxyHealth;
    return matchSearch && matchGroup && matchStatus && matchTag && matchOwner && matchProxyHealth;
  });

  const runningCount = profiles.filter((profile) => getProfileStatus(profile.id) === 'running').length;
  const groupedCount = profiles.filter((profile) => Boolean(profile.group)).length;
  const taggedCount = profiles.filter((profile) => (profile.tags ?? []).length > 0).length;
  const proxiedCount = profiles.filter((profile) => Boolean(getProfileProxyId(profile))).length;
  const healthyProxyCount = profiles.filter((profile) => profile.proxy?.lastCheckStatus === 'healthy').length;
  const failingProxyCount = profiles.filter((profile) => profile.proxy?.lastCheckStatus === 'failing').length;
  const showingResults = t.common.showingResults
    .replace('{filtered}', String(filtered.length))
    .replace('{total}', String(profiles.length));
  const bulkCreateEntries = parseBulkProfileDrafts(bulkCreateText);
  const enabledExtensions = extensions.filter((extension) => extension.enabled);
  const proxyMap = new Map(proxies.map((proxy) => [proxy.id, proxy]));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;
      const tagName = target.tagName;
      const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA';

      if (event.ctrlKey && event.key === 'n') {
        event.preventDefault();
        openCreate();
        return;
      }

      if (event.ctrlKey && event.key === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (isInput) {
        return;
      }

      if (event.key === '?') {
        setShortcutsOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        if (drawerOpen) {
          setDrawerOpen(false);
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((current) => Math.min(current + 1, filtered.length - 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((current) => Math.max(current - 1, 0));
      }

      if (event.key === 'Enter' && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        openEdit(filtered[highlightedIndex].id);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, filtered, highlightedIndex, shortcutsOpen]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filterGroup, filterOwner, filterProxyHealth, filterStatus, filterTag, search]);

  if (profiles.length === 0 && !onboardingCompleted && (!loading || wizardOpen)) {
    return (
      <>
        <WelcomeScreen
          onCreateProfile={() => {
            setWizardOpen(true);
          }}
          onSkip={() => void completeOnboarding()}
        />
        <OnboardingWizard
          open={wizardOpen}
          onFinish={() => {
            setOnboardingCompleted(true);
            setWizardOpen(false);
            void fetchProfiles();
            void fetchRuntimes();
          }}
        />
      </>
    );
  }

  const columns: ColumnsType<Profile> = [
    {
      title: t.common.name,
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openEdit(record.id)}>
            {name}
          </Button>
          {record.group ? <Typography.Text type="secondary">{record.group}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: t.common.status,
      key: 'status',
      width: 130,
      render: (_, record) => {
        const status = getProfileStatus(record.id);
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
      key: 'proxy',
      width: 260,
      render: (_, record) => {
        const proxyId = getProfileProxyId(record);
        if (!proxyId) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }

        const proxy = record.proxy ?? proxyMap.get(proxyId);
        if (!proxy) {
          return <Tag color="orange">{proxyId.slice(0, 8)}</Tag>;
        }

        const label = proxy.label?.trim()
          ? proxy.label
          : `${proxy.host}:${proxy.port}`;

        return (
          <Space direction="vertical" size={0}>
            <Space size={4} wrap>
              <Tag color="blue">{proxy.type.toUpperCase()}</Tag>
              {proxy.lastCheckStatus === 'healthy' ? <Tag color="green">Healthy</Tag> : null}
              {proxy.lastCheckStatus === 'failing' ? <Tag color="red">Needs check</Tag> : null}
            </Space>
            <Typography.Text>{label}</Typography.Text>
            {proxy.lastCheckStatus === 'healthy' && proxy.lastCheckAt ? (
              <Typography.Text type="secondary">
                {proxy.lastCheckTimezone
                  ? `${proxy.lastCheckIp ?? '—'} · ${proxy.lastCheckTimezone}`
                  : proxy.lastCheckIp ?? '—'}
              </Typography.Text>
            ) : null}
            {proxy.lastCheckStatus === 'failing' && proxy.lastCheckError ? (
              <Typography.Text type="danger">{proxy.lastCheckError}</Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: t.common.tags,
      dataIndex: 'tags',
      key: 'tags',
      render: (profileTags: string[] | undefined) => (
        (profileTags ?? []).length > 0
          ? (profileTags ?? []).map((tag) => <Tag key={tag}>{tag}</Tag>)
          : <Typography.Text type="secondary">—</Typography.Text>
      ),
    },
    {
      title: t.common.owner,
      dataIndex: 'owner',
      key: 'owner',
      width: 140,
      render: (owner?: string | null) => (
        owner
          ? <Tag color="purple">{owner}</Tag>
          : <Typography.Text type="secondary">—</Typography.Text>
      ),
    },
    {
      title: t.profile.lastUsed,
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 150,
      render: (lastUsedAt?: string | null) => (
        lastUsedAt
          ? new Date(lastUsedAt).toLocaleDateString('vi-VN')
          : <Typography.Text type="secondary">—</Typography.Text>
      ),
    },
    {
      title: t.common.actions,
      key: 'actions',
      width: 210,
      render: (_, record) => {
        const isRunning = getProfileStatus(record.id) === 'running';
        return (
          <Space size={4}>
            {isRunning ? (
              <Tooltip title={t.profile.stopProfile}>
                <Button size="small" danger icon={<StopOutlined />} onClick={() => void handleStop(record.id)} />
              </Tooltip>
            ) : (
              <Tooltip title={t.profile.startProfile}>
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => void confirmAndStartProfiles([record.id])} />
              </Tooltip>
            )}
            <Tooltip title="Khởi động lại">
              <Button size="small" icon={<RedoOutlined />} onClick={() => void handleRestart(record.id)} />
            </Tooltip>
            <Tooltip title={t.profile.duplicateProfile}>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void handleClone(record)} />
            </Tooltip>
            <Tooltip title={t.profile.exportProfile}>
              <Button size="small" icon={<ExportOutlined />} onClick={() => handleExport(record.id)} />
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

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card style={{ ...cardStyle, background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }} bordered={false}>
            <Row gutter={[24, 24]} align="middle">
              <Col flex="auto">
                <Typography.Title level={3} style={{ marginBottom: 8 }}>
                  {t.profile.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                  {t.profile.workspaceSubtitle}
                </Typography.Paragraph>
              </Col>
              <Col>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t.profile.newProfile} (Ctrl+N)
                </Button>
                <Button style={{ marginLeft: 8 }} icon={<ImportOutlined />} onClick={openImportPackages}>
                  Import package
                </Button>
                <Button style={{ marginLeft: 8 }} onClick={openBulkCreate}>
                  Tạo hàng loạt
                </Button>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic title={t.profile.totalProfiles} value={profiles.length} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic title={t.profile.runningProfiles} value={runningCount} valueStyle={{ color: '#1677ff' }} prefix={<PlayCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic title={t.profile.groupedProfiles} value={groupedCount} prefix={<ReloadOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic title={t.profile.taggedProfiles} value={taggedCount} prefix={<TagsOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic title="Có proxy" value={proxiedCount} valueStyle={{ color: '#08979c' }} />
          </Card>
        </Col>
      </Row>

      <Card style={cardStyle} bodyStyle={{ paddingBottom: 12 }}>
        <Row gutter={[12, 12]} style={{ marginBottom: 8 }} align="middle">
          <Col flex="auto">
            <Space wrap>
              <Input
                ref={searchRef}
                placeholder={`${t.common.search} (Ctrl+F)`}
                prefix={<SearchOutlined />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                allowClear
                style={{ width: 220 }}
              />
              <Select
                placeholder={t.common.group}
                allowClear
                value={filterGroup}
                onChange={setFilterGroup}
                style={{ width: 150 }}
                options={groups.map((group) => ({ label: group, value: group }))}
              />
              <Select
                placeholder={t.common.status}
                allowClear
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 150 }}
                options={[
                  { label: t.profile.running, value: 'running' },
                  { label: t.profile.stopped, value: 'stopped' },
                  { label: t.profile.unreachable, value: 'unreachable' },
                ]}
              />
              <Select
                placeholder={t.profile.tagFilter}
                allowClear
                value={filterTag}
                onChange={setFilterTag}
                style={{ width: 170 }}
                options={tags.map((tag) => ({ label: tag, value: tag }))}
              />
              <Select
                placeholder={t.profile.ownerFilter}
                allowClear
                value={filterOwner}
                onChange={setFilterOwner}
                style={{ width: 170 }}
                options={owners.map((owner) => ({ label: owner, value: owner }))}
              />
              <Select
                placeholder="Sức khỏe proxy"
                allowClear
                value={filterProxyHealth}
                onChange={setFilterProxyHealth}
                style={{ width: 170 }}
                options={[
                  { label: 'Healthy', value: 'healthy' },
                  { label: 'Needs check', value: 'failing' },
                  { label: 'Không có proxy', value: 'none' },
                ]}
              />
              <Button icon={<ReloadOutlined />} onClick={() => { void fetchProfiles(); void fetchProxies(); void fetchInstances(); }} />
              <Tooltip title="Phím tắt (?)">
                <Button icon={<QuestionCircleOutlined />} onClick={() => setShortcutsOpen(true)} />
              </Tooltip>
            </Space>
          </Col>
        </Row>

        <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
          <Col>
            <Space wrap>
              <Typography.Text type="secondary">{showingResults}</Typography.Text>
              <Button size="small" onClick={selectFilteredProfiles} disabled={filtered.length === 0}>
                Chọn tất cả kết quả lọc
              </Button>
              <Button size="small" onClick={selectFilteredRunningProfiles} disabled={filtered.every((profile) => getProfileStatus(profile.id) !== 'running')}>
                Chọn đang chạy
              </Button>
              <Button size="small" onClick={clearSelection} disabled={selectedIds.length === 0}>
                Bỏ chọn
              </Button>
            </Space>
          </Col>
          <Col>
            {selectedIds.length > 0 ? (
              <Space wrap>
                <Typography.Text type="secondary">Đã chọn {selectedIds.length}</Typography.Text>
                <Button
                  size="small"
                  loading={bulkProxyTesting}
                  onClick={() => void handleBulkTestSelectedProxies()}
                >
                  Test proxy đã chọn
                </Button>
                <Select
                  value={bulkProxySelection}
                  onChange={setBulkProxySelection}
                  placeholder="Gán hoặc gỡ proxy"
                  allowClear
                  style={{ width: 240 }}
                  options={[
                    { label: 'Gỡ proxy khỏi các hồ sơ đã chọn', value: '__NONE__' },
                    ...proxies.map((proxy) => ({
                      label: `[${proxy.type.toUpperCase()}] ${proxy.label?.trim() ? `${proxy.label} — ` : ''}${proxy.host}:${proxy.port}`,
                      value: proxy.id,
                    })),
                  ]}
                />
                <Button
                  size="small"
                  onClick={() => void handleBulkAssignProxy()}
                  disabled={bulkProxySelection === undefined}
                >
                  Áp dụng proxy
                </Button>
                <Button size="small" onClick={openBulkExtensions}>
                  Gán extension
                </Button>
                <Button size="small" onClick={openBulkEdit}>
                  Sửa metadata
                </Button>
                <Button size="small" icon={<RedoOutlined />} onClick={() => void handleBulkRestart()}>
                  Restart đã chọn
                </Button>
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
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    {t.profile.bulkDelete}
                  </Button>
                </Popconfirm>
              </Space>
            ) : null}
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
          }}
          rowClassName={(_, index) => (index === highlightedIndex ? 'ant-table-row-selected' : '')}
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
      </Card>

      <ProfileForm
        open={drawerOpen}
        profileId={editingId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          void fetchProfiles();
        }}
      />

      <Modal
        title="Import profile package"
        open={importPackagesOpen}
        onCancel={() => setImportPackagesOpen(false)}
        onOk={() => void handleImportProfilePackages()}
        okText={importPackageFiles.length > 0 ? `Import ${importPackageFiles.length}` : 'Import'}
        cancelText="Hủy"
        confirmLoading={importingPackages}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Chọn các gói profile đã export từ Pro5 ở dạng <Typography.Text code>.zip</Typography.Text>.
            Hệ thống sẽ tạo profile mới với metadata, bookmarks, cookie jar và user data đi kèm.
          </Typography.Paragraph>
          <Upload.Dragger
            multiple
            accept=".zip"
            fileList={importPackageFiles}
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              setImportPackageFiles(fileList);
            }}
            onRemove={(file) => {
              setImportPackageFiles((current) => current.filter((item) => item.uid !== file.uid));
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Kéo thả hoặc chọn gói profile để import</p>
            <p className="ant-upload-hint">Có thể chọn nhiều file trong một lượt để tạo nhiều profile mới.</p>
          </Upload.Dragger>
        </Space>
      </Modal>

      <Modal
        title="Sửa metadata hàng loạt"
        open={bulkEditOpen}
        onCancel={() => setBulkEditOpen(false)}
        onOk={() => void handleBulkEditProfiles()}
        okText="Áp dụng"
        cancelText="Hủy"
        confirmLoading={bulkEditing}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Các trường để trống sẽ được giữ nguyên cho {selectedIds.length} hồ sơ đã chọn.
          </Typography.Text>
          <Input
            value={bulkEditGroup}
            onChange={(event) => setBulkEditGroup(event.target.value)}
            placeholder="Nhóm mới"
          />
          <Input
            value={bulkEditOwner}
            onChange={(event) => setBulkEditOwner(event.target.value)}
            placeholder="Owner mới"
          />
          <Select
            value={bulkEditRuntime}
            onChange={setBulkEditRuntime}
            placeholder="Đổi runtime cho cả batch"
            allowClear
            style={{ width: '100%' }}
            options={[
              { label: 'Tự động', value: 'auto' },
              ...runtimes.map((runtime) => ({
                label: `${runtime.label ?? runtime.name ?? runtime.key}${runtime.available ? '' : ' (không khả dụng)'}`,
                value: runtime.key,
                disabled: !runtime.available,
              })),
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="Gán extension cho nhiều profile"
        open={bulkExtensionsOpen}
        onCancel={() => setBulkExtensionsOpen(false)}
        onOk={() => void handleBulkApplyExtensions()}
        okText="Áp dụng"
        cancelText="Hủy"
        confirmLoading={bulkApplyingExtensions}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Bundle và extension sẽ được thêm vào stack hiện có của {selectedIds.length} hồ sơ đã chọn.
          </Typography.Text>
          <Select
            mode="multiple"
            value={bulkExtensionCategories}
            onChange={setBulkExtensionCategories}
            placeholder="Chọn bundle extension theo use case"
            style={{ width: '100%' }}
            options={extensionBundles.map((bundle) => ({
              label: `${bundle.label} · ${bundle.extensionCount} extension`,
              value: bundle.key,
            }))}
          />
          <Select
            mode="multiple"
            value={bulkExtensionIds}
            onChange={setBulkExtensionIds}
            placeholder="Chọn extension bổ sung cho batch"
            style={{ width: '100%' }}
            options={enabledExtensions.map((extension) => ({
              label: `${extension.name}${extension.version ? ` · v${extension.version}` : ''}`,
              value: extension.id,
            }))}
          />
          <Typography.Text type="secondary">
            Không ghi đè stack cũ. Hệ thống sẽ tự gộp thêm extension mới và loại bỏ id trùng.
          </Typography.Text>
        </Space>
      </Modal>

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

      <Modal
        title="Tạo profile hàng loạt"
        open={bulkCreateOpen}
        onCancel={() => setBulkCreateOpen(false)}
        onOk={() => void handleBulkCreateProfiles()}
        okText={bulkCreateEntries.length > 0 ? `Tạo ${bulkCreateEntries.length}` : 'Tạo'}
        cancelText="Hủy"
        confirmLoading={bulkCreating}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Mỗi dòng là một profile. Định dạng:
            {' '}
            <Typography.Text code>name | group | owner | tag1,tag2 | notes</Typography.Text>
          </Typography.Paragraph>
          <Input.TextArea
            value={bulkCreateText}
            onChange={(event) => setBulkCreateText(event.target.value)}
            rows={8}
            placeholder={[
              'Facebook Warm 01 | Growth | owner-a | warm,fb | Main account',
              'Facebook Warm 02 | Growth | owner-a | warm,fb | Backup account',
              'TikTok Shop 01',
            ].join('\n')}
          />
          <Select
            value={bulkCreateRuntime}
            onChange={setBulkCreateRuntime}
            style={{ width: '100%' }}
            options={[
              { label: 'Tự động', value: 'auto' },
              ...runtimes.map((runtime) => ({
                label: `${runtime.label ?? runtime.name ?? runtime.key}${runtime.available ? '' : ' (không khả dụng)'}`,
                value: runtime.key,
                disabled: !runtime.available,
              })),
            ]}
          />
          <Select
            value={bulkCreateProxyId}
            onChange={setBulkCreateProxyId}
            placeholder="Gắn một proxy chung cho cả batch (tùy chọn)"
            allowClear
            style={{ width: '100%' }}
            options={proxies.map((proxy) => ({
              label: `[${proxy.type.toUpperCase()}] ${proxy.label?.trim() ? `${proxy.label} — ` : ''}${proxy.host}:${proxy.port}`,
              value: proxy.id,
            }))}
          />
          <Typography.Text type="secondary">Preview hợp lệ: {bulkCreateEntries.length} profile</Typography.Text>
        </Space>
      </Modal>
    </div>
  );
};

export default ProfileList;
