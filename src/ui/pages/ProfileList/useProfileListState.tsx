import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { parseBulkProfileDrafts } from '../../utils/bulkProfiles';
import { useProfileListData } from './hooks/useProfileListData';
import { useProfileListFilters } from './hooks/useProfileListFilters';
import { useProfileListUIState } from './hooks/useProfileListUIState';
import { useProfileListActions } from './hooks/useProfileListActions';
import { useProfileListShortcuts } from './hooks/useProfileListShortcuts';

export * from './types';

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

  const data = useProfileListData();
  const ui = useProfileListUIState();
  const filters = useProfileListFilters(data.profiles, data.instances);
  const actions = useProfileListActions(data, filters, ui, t, navigate, location);

  useProfileListShortcuts(ui, actions, filters);

  const { profiles, extensions, proxies } = data;
  const { filtered, stats } = filters;

  const showingResults = (t.common.showingResults ?? 'Showing {filtered} of {total} profiles')
    .replace('{filtered}', String(filtered.length))
    .replace('{total}', String(profiles.length));
    
  const enabledExtensions = extensions.filter((extension) => extension.enabled);
  const proxyMap = new Map(proxies.map((proxy) => [proxy.id, proxy]));

  useEffect(() => {
    const navigationState = location.state as { openCreate?: boolean } | null;
    if (!navigationState?.openCreate) {
      return;
    }

    void (async () => {
      const runtimeList = await data.fetchRuntimes();
      const hasAvailableRuntime = runtimeList.some((runtime) => runtime.available);
      if (!hasAvailableRuntime) {
        ui.setWizardOpen(true);
      } else {
        ui.setEditingId(undefined);
        ui.setDrawerOpen(true);
      }

      navigate(location.pathname, { replace: true, state: null });
    })();
  }, [
    data.fetchRuntimes,
    location.pathname,
    location.state,
    navigate,
    ui.setDrawerOpen,
    ui.setEditingId,
    ui.setWizardOpen,
  ]);

  useEffect(() => {
    ui.setHighlightedIndex(-1);
  }, [
    filters.filterGroup,
    filters.filterOwner,
    filters.filterProxyHealth,
    filters.filterStatus,
    filters.filterTag,
    filters.search,
    ui.setHighlightedIndex,
  ]);

  return {
    t, format,
    ...data,
    ...ui,
    ...filters,
    ...actions,
    
    // Stats & counts from filters.stats
    ...stats,
    
    // Specific derived vars
    showingResults,
    enabledExtensions,
    proxyMap,
    bulkCreateEntries: parseBulkProfileDrafts(ui.bulkCreateText),
  };
}

export type ProfileListState = ReturnType<typeof useProfileListState>;
