import React, { useCallback } from 'react';
import { Modal, message } from 'antd';
import { apiClient, buildApiUrl } from '../../../api/client';
import { finalizeOnboarding } from '../../onboarding/onboardingState';
import { mergeBulkExtensionSelection } from '../../../shared/utils/bulkExtensionSelection';
import { parseBulkProfileDrafts } from '../../../shared/utils/bulkProfiles';
import { Profile, ProxyOption, RuntimeOption, ExtensionRecord, ExtensionBundle, BulkCreateResponse, Instance } from '../types';
import {
  buildBulkAssignProxySuccessMessage,
  buildBulkApplyExtensionTargetProfiles,
  buildBulkEditPayload,
  buildFailingProxyConfirmDetails,
  buildProxyTestSummaryMessage,
  getFailingProxyProfiles,
  getImportProfilePackageFiles,
  getSelectedProfileProxyIds,
  getUniqueTruthyValues,
  importProfilePackages,
  resolveBulkAssignProxyValue,
} from '../profileListAction.utils';
import { useProfileListData } from './useProfileListData';
import { useProfileListFilters } from './useProfileListFilters';
import { useProfileListUIState } from './useProfileListUIState';

export function useProfileListActions(
  data: ReturnType<typeof useProfileListData>,
  filters: ReturnType<typeof useProfileListFilters>,
  ui: ReturnType<typeof useProfileListUIState>,
  t: any,
  navigate: (path: string, options?: any) => void,
  location: any
) {
  const { fetchProfiles, fetchInstances, fetchProxies, fetchRuntimes, setOnboardingCompleted } = data;
  const { filtered, getProfileStatus, getProfileProxyId } = filters;
  const { 
    setSelectedIds, setDrawerOpen, setEditingId, setWizardOpen,
    setBulkCreateOpen, setBulkCreateText, setBulkCreateRuntime, setBulkCreateProxyId, setBulkCreating,
    setImportPackagesOpen, setImportPackageFiles, setImportingPackages,
    setBulkEditOpen, setBulkEditing, setBulkExtensionsOpen, setBulkExtensionIds, 
    setBulkExtensionCategories, setBulkApplyingExtensions, setBulkProxySelection, setBulkProxyTesting
  } = ui;

  const handleStart = useCallback(async (profileId: string) => {
    const res = await apiClient.post(`/api/profiles/${profileId}/start`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void fetchInstances();
    void fetchProfiles();
  }, [fetchInstances, fetchProfiles]);

  const confirmAndStartProfiles = useCallback(async (ids: string[]) => {
    const failingProxyProfiles = getFailingProxyProfiles(data.profiles, ids);
    const confirmDetails = buildFailingProxyConfirmDetails(failingProxyProfiles);

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
          <p>{`Có ${confirmDetails.count} hồ sơ đang dùng proxy ở trạng thái Needs check.`}</p>
          <p style={{ color: '#8c8c8c' }}>
            {confirmDetails.previewNames}
            {confirmDetails.hasMore ? '...' : ''}
          </p>
        </div>
      ),
      onOk: async () => {
        await Promise.all(ids.map(async (id) => handleStart(id)));
      },
      onCancel: async () => {
        const failingProxyIds = getUniqueTruthyValues(
          failingProxyProfiles.map((profile) => getProfileProxyId(profile)),
        );

        if (!failingProxyIds.length) return;

        const res = await apiClient.post<{ total: number; healthy: number; failing: number }>('/api/proxies/test-bulk', { ids: failingProxyIds });
        if (!res.success) {
          void message.error(res.error);
          return;
        }

        void message.success(buildProxyTestSummaryMessage(res.data));
        await fetchProfiles();
        await fetchProxies();
      },
    });
  }, [data.profiles, fetchProfiles, fetchProxies, getProfileProxyId, handleStart]);

  const handleStop = useCallback(async (profileId: string) => {
    const res = await apiClient.post(`/api/profiles/${profileId}/stop`);
    if (!res.success) {
      if ('error' in res) {
        void message.error(res.error);
      }
      return;
    }
    void fetchInstances();
  }, [fetchInstances]);

  const handleRestart = useCallback(async (profileId: string) => {
    const res = await apiClient.post(`/api/profiles/${profileId}/restart`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void fetchInstances();
    void fetchProfiles();
  }, [fetchInstances, fetchProfiles]);

  const handleDelete = useCallback(async (profileId: string) => {
    const res = await apiClient.delete(`/api/profiles/${profileId}`);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success('Đã xóa hồ sơ');
    data.setProfiles((current: Profile[]) => current.filter((p) => p.id !== profileId));
    setSelectedIds((current: string[]) => current.filter((id) => id !== profileId));
  }, [data, setSelectedIds]);

  const handleClone = useCallback(async (profile: Profile) => {
    const res = await apiClient.post<Profile>(`/api/profiles/${profile.id}/clone`, {
      name: `${profile.name} Copy`,
    });
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.profile.duplicateSuccess);
    void fetchProfiles();
  }, [fetchProfiles, t.profile.duplicateSuccess]);

  const handleExport = useCallback((profileId: string) => {
    window.open(buildApiUrl(`/api/profiles/${profileId}/export`), '_blank');
  }, []);

  const handleBulkStart = useCallback(async () => {
    await confirmAndStartProfiles(ui.selectedIds);
    setSelectedIds([]);
  }, [confirmAndStartProfiles, ui.selectedIds, setSelectedIds]);

  const handleBulkStop = useCallback(async () => {
    await Promise.all(ui.selectedIds.map(async (id: string) => handleStop(id)));
    setSelectedIds([]);
  }, [handleStop, ui.selectedIds, setSelectedIds]);

  const handleBulkDelete = useCallback(async () => {
    await Promise.all(ui.selectedIds.map(async (id: string) => handleDelete(id)));
    setSelectedIds([]);
  }, [handleDelete, ui.selectedIds, setSelectedIds]);

  const handleBulkRestart = useCallback(async () => {
    const results = await Promise.all(ui.selectedIds.map(async (id: string) => apiClient.post(`/api/profiles/${id}/restart`)));
    const failed = results.find((result) => !result.success);
    if (failed) {
      void message.error(failed.error);
      return;
    }
    void message.success(`Đã restart ${ui.selectedIds.length} hồ sơ`);
    setSelectedIds([]);
    void fetchInstances();
    void fetchProfiles();
  }, [fetchInstances, fetchProfiles, ui.selectedIds, setSelectedIds]);

  const selectFilteredProfiles = useCallback(() => {
    setSelectedIds(filtered.map((p: Profile) => p.id));
  }, [filtered, setSelectedIds]);

  const selectFilteredRunningProfiles = useCallback(() => {
    setSelectedIds(filtered.filter((p: Profile) => getProfileStatus(p.id) === 'running').map((p: Profile) => p.id));
  }, [filtered, getProfileStatus, setSelectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);

  const openBulkCreate = useCallback(() => {
    setBulkCreateText('');
    setBulkCreateRuntime('auto');
    setBulkCreateProxyId(undefined);
    setBulkCreateOpen(true);
  }, [setBulkCreateOpen, setBulkCreateProxyId, setBulkCreateRuntime, setBulkCreateText]);

  const openImportPackages = useCallback(() => {
    setImportPackageFiles([]);
    setImportPackagesOpen(true);
  }, [setImportPackageFiles, setImportPackagesOpen]);

  const openBulkEdit = useCallback(() => {
    ui.setBulkEditGroup('');
    ui.setBulkEditClearGroup(false);
    ui.setBulkEditOwner('');
    ui.setBulkEditClearOwner(false);
    ui.setBulkEditRuntime(undefined);
    ui.setBulkEditAddTags([]);
    ui.setBulkEditRemoveTags([]);
    setBulkEditOpen(true);
  }, [setBulkEditOpen, ui]);

  const openBulkExtensions = useCallback(() => {
    setBulkExtensionIds([]);
    setBulkExtensionCategories([]);
    setBulkExtensionsOpen(true);
  }, [setBulkExtensionCategories, setBulkExtensionIds, setBulkExtensionsOpen]);

  const handleBulkCreateProfiles = useCallback(async () => {
    const entries = parseBulkProfileDrafts(ui.bulkCreateText);
    if (entries.length === 0) {
      void message.warning('Hãy nhập ít nhất một dòng profile hợp lệ');
      return;
    }

    setBulkCreating(true);
    const res = await apiClient.post<BulkCreateResponse>('/api/profiles/bulk-create', {
      entries,
      runtime: ui.bulkCreateRuntime,
      proxyId: ui.bulkCreateProxyId,
    });
    setBulkCreating(false);

    if (!res.success) {
      if ('error' in res) {
        void message.error(res.error);
      }
      return;
    }

    void message.success(`Đã tạo ${res.data.total} hồ sơ`);
    setBulkCreateOpen(false);
    setBulkCreateText('');
    setBulkCreateRuntime('auto');
    setBulkCreateProxyId(undefined);
    void fetchProfiles();
  }, [fetchProfiles, setBulkCreateOpen, setBulkCreateProxyId, setBulkCreateRuntime, setBulkCreateText, setBulkCreating, ui.bulkCreateProxyId, ui.bulkCreateRuntime, ui.bulkCreateText]);

  const handleImportProfilePackages = useCallback(async () => {
    const filesToImport = getImportProfilePackageFiles(ui.importPackageFiles);

    if (filesToImport.length === 0) {
      void message.warning('Hãy chọn ít nhất một gói profile `.zip` để import');
      return;
    }

    setImportingPackages(true);
    const { successCount, failCount } = await importProfilePackages(filesToImport, async (file) => {
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
      return json.success;
    });

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
  }, [fetchProfiles, setImportPackageFiles, setImportPackagesOpen, setImportingPackages, ui.importPackageFiles]);

  const handleBulkEditProfiles = useCallback(async () => {
    const payload = buildBulkEditPayload({
      group: ui.bulkEditGroup,
      owner: ui.bulkEditOwner,
      runtime: ui.bulkEditRuntime,
    });

    if (Object.keys(payload).length === 0) {
      void message.warning('Hãy nhập ít nhất một thay đổi để áp dụng');
      return;
    }

    setBulkEditing(true);
    const results = await Promise.all(ui.selectedIds.map(async (id: string) => apiClient.put(`/api/profiles/${id}`, payload)));
    setBulkEditing(false);
    const failed = results.find((result) => !result.success);
    if (failed) {
      void message.error(failed.error);
      return;
    }

    void message.success(`Đã cập nhật ${ui.selectedIds.length} hồ sơ`);
    setBulkEditOpen(false);
    setSelectedIds([]);
    void fetchProfiles();
  }, [fetchProfiles, setBulkEditOpen, setBulkEditing, setSelectedIds, ui.bulkEditGroup, ui.bulkEditOwner, ui.bulkEditRuntime, ui.selectedIds]);

  const handleBulkApplyExtensions = useCallback(async () => {
    if (ui.bulkExtensionIds.length === 0 && ui.bulkExtensionCategories.length === 0) {
      void message.warning('Hãy chọn ít nhất một extension hoặc bundle để áp dụng');
      return;
    }

    const selectedProfiles = buildBulkApplyExtensionTargetProfiles(data.profiles, ui.selectedIds);

    if (selectedProfiles.length === 0) {
      void message.warning('Không tìm thấy hồ sơ nào để cập nhật');
      return;
    }

    setBulkApplyingExtensions(true);
    const results = await Promise.all(selectedProfiles.map(async (profile) => apiClient.put(`/api/profiles/${profile.id}`, {
      extensionIds: mergeBulkExtensionSelection({
        currentExtensionIds: profile.extensionIds ?? [],
        selectedExtensionIds: ui.bulkExtensionIds,
        selectedCategories: ui.bulkExtensionCategories,
        bundles: data.extensionBundles,
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
  }, [data.extensionBundles, data.profiles, fetchProfiles, setBulkApplyingExtensions, setBulkExtensionCategories, setBulkExtensionIds, setBulkExtensionsOpen, setSelectedIds, ui.bulkExtensionCategories, ui.bulkExtensionIds, ui.selectedIds]);

  const handleBulkAssignProxy = useCallback(async () => {
    if (!ui.selectedIds.length || ui.bulkProxySelection === undefined) return;

    const proxyId = resolveBulkAssignProxyValue(ui.bulkProxySelection);
    const results = await Promise.all(
      ui.selectedIds.map(async (id: string) => apiClient.put(`/api/profiles/${id}`, { proxyId }))
    );
    const failed = results.find((result) => !result.success);
    if (failed && 'error' in failed) {
      void message.error(failed.error);
      return;
    }

    void message.success(buildBulkAssignProxySuccessMessage(ui.selectedIds.length, proxyId));
    setBulkProxySelection(undefined);
    setSelectedIds([]);
    await fetchProfiles();
  }, [fetchProfiles, setBulkProxySelection, setSelectedIds, ui.bulkProxySelection, ui.selectedIds]);

  const handleBulkTestSelectedProxies = useCallback(async () => {
    const proxyIds = getSelectedProfileProxyIds(data.profiles, ui.selectedIds, getProfileProxyId);

    if (!proxyIds.length) {
      void message.warning('Các hồ sơ đã chọn chưa có proxy để test');
      return;
    }

    setBulkProxyTesting(true);
    const res = await apiClient.post<{ total: number; healthy: number; failing: number }>('/api/proxies/test-bulk', { ids: proxyIds });
    setBulkProxyTesting(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    void message.success(buildProxyTestSummaryMessage(res.data));
    await fetchProfiles();
    await fetchProxies();
  }, [data.profiles, fetchProfiles, fetchProxies, getProfileProxyId, setBulkProxyTesting, ui.selectedIds]);

  const completeOnboarding = useCallback(async () => {
    await finalizeOnboarding({
      status: 'skipped',
      currentStep: 0,
      skippedAt: new Date().toISOString(),
    });
    setOnboardingCompleted(true);
  }, [setOnboardingCompleted]);

  const openCreate = useCallback(() => {
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
  }, [fetchRuntimes, setDrawerOpen, setEditingId, setWizardOpen, t.dashboard.runtimeActionHint]);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setDrawerOpen(true);
  }, [setDrawerOpen, setEditingId]);

  return {
    handleStart, confirmAndStartProfiles, handleStop, handleRestart, handleDelete, handleClone,
    handleExport, handleBulkStart, handleBulkStop, handleBulkDelete, handleBulkRestart,
    selectFilteredProfiles, selectFilteredRunningProfiles, clearSelection,
    openBulkCreate, openImportPackages, openBulkEdit, openBulkExtensions,
    handleBulkCreateProfiles, handleImportProfilePackages, handleBulkEditProfiles, handleBulkApplyExtensions,
    handleBulkAssignProxy, handleBulkTestSelectedProxies, completeOnboarding, openCreate, openEdit
  };
}
