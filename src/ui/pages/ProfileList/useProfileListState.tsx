import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { InputRef } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient, buildApiUrl } from '../../api/client';
import { useTranslation } from '../../hooks/useTranslation';
import { useWebSocket } from '../../hooks/useWebSocket';
import { finalizeOnboarding } from '../../utils/onboarding';
import { mergeBulkExtensionSelection } from '../../utils/bulkExtensionSelection';
import { parseBulkProfileDrafts } from '../../utils/bulkProfiles';

export interface Profile {
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

export interface ExtensionRecord {
  id: string;
  name: string;
  version: string | null;
  enabled: boolean;
  category?: string | null;
}

export interface ExtensionBundle {
  key: string;
  label: string;
  extensionIds: string[];
  extensionCount: number;
}

export interface ProxyOption {
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

export interface Instance {
  profileId: string;
  status: 'running' | 'unreachable' | 'stopped';
  port?: number;
}

export interface RuntimeOption {
  key: string;
  available: boolean;
  label?: string;
  name?: string;
}

interface BulkCreateResponse {
  total: number;
  profiles: Profile[];
}

export const SHORTCUTS = [
  { key: 'Ctrl+N', desc: 'Tạo profile mới' },
  { key: 'Ctrl+F', desc: 'Tìm kiếm' },
  { key: '↑ / ↓', desc: 'Di chuyển giữa các hàng' },
  { key: 'Enter', desc: 'Mở profile đang chọn' },
  { key: 'Escape', desc: 'Đóng drawer / modal' },
  { key: '?', desc: 'Hiện bảng phím tắt này' },
];

export function useProfileListState() {
  const { t, format } = useTranslation();
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
      okText: 'Vẫn khởi động',
      cancelText: 'Kiểm tra lại proxy',
      content: (
        <div>
          <p>{`Có ${failingProxyProfiles.length} hồ sơ đang dùng proxy ở trạng thái Needs check.`}</p>
          <p style={{ color: '#8c8c8c' }}>
            {failingProxyProfiles.slice(0, 3).map((profile) => profile.name).join(', ')}
            {failingProxyProfiles.length > 3 ? '...' : ''}
          </p>
        </div>
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
  const showingResults = (t.common.showingResults ?? 'Showing {filtered} of {total} profiles')
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

  return {
    t, format,
    profiles, proxies, runtimes, extensions, extensionBundles, instances,
    loading, selectedIds, bulkProxySelection, search, filterGroup, filterStatus,
    filterTag, filterOwner, filterProxyHealth, drawerOpen, editingId,
    bulkCreateOpen, bulkCreateText, bulkCreateRuntime, bulkCreateProxyId, bulkCreating,
    importPackagesOpen, importPackageFiles, importingPackages,
    bulkEditOpen, bulkEditGroup, bulkEditClearGroup, bulkEditOwner, bulkEditClearOwner, 
    bulkEditRuntime, bulkEditAddTags, bulkEditRemoveTags, bulkEditing,
    bulkExtensionsOpen, bulkExtensionIds, bulkExtensionCategories, bulkApplyingExtensions,
    shortcutsOpen, onboardingCompleted, wizardOpen, highlightedIndex, bulkProxyTesting, searchRef,
    
    // Setters
    setSearch, setFilterGroup, setFilterStatus, setFilterTag, setFilterOwner, setFilterProxyHealth, 
    setDrawerOpen, setEditingId, setBulkCreateOpen, setBulkCreateText, setBulkCreateRuntime, 
    setBulkCreateProxyId, setImportPackagesOpen, setImportPackageFiles, setBulkEditOpen, 
    setBulkEditGroup, setBulkEditClearGroup, setBulkEditOwner, setBulkEditClearOwner, 
    setBulkEditRuntime, setBulkEditAddTags, setBulkEditRemoveTags, setBulkExtensionsOpen, 
    setBulkExtensionIds, setBulkExtensionCategories, setShortcutsOpen, setWizardOpen, 
    setHighlightedIndex, setBulkProxySelection, setSelectedIds, setOnboardingCompleted,
    
    // Functions
    getProfileProxyId, getProfileStatus, fetchProfiles, fetchProxies, fetchInstances, fetchRuntimes,
    handleStart, confirmAndStartProfiles, handleStop, handleRestart, handleDelete, handleClone, handleExport,
    handleBulkStart, handleBulkStop, handleBulkDelete, handleBulkRestart,
    selectFilteredProfiles, selectFilteredRunningProfiles, clearSelection,
    openBulkCreate, openImportPackages, openBulkEdit, openBulkExtensions,
    handleBulkCreateProfiles, handleImportProfilePackages, handleBulkEditProfiles, handleBulkApplyExtensions,
    handleBulkAssignProxy, handleBulkTestSelectedProxies, completeOnboarding, openCreate, openEdit,
    
    // Derived vars
    groups, owners, tags, filtered, runningCount, groupedCount, taggedCount, proxiedCount, 
    healthyProxyCount, failingProxyCount, showingResults, bulkCreateEntries, 
    enabledExtensions, proxyMap
  };
}

export type ProfileListState = ReturnType<typeof useProfileListState>;
