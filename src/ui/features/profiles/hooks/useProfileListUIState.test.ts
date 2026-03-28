import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchRef: { current: { focus: vi.fn() } },
  stateCursor: 0,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('react', () => ({
  useRef: () => mocks.searchRef,
  useState: <T>(initial: T) => {
    const setter = vi.fn();
    mocks.stateSetters[mocks.stateCursor] = setter;
    mocks.stateCursor += 1;
    return [initial, setter] as const;
  },
}));

describe('useProfileListUIState', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.stateCursor = 0;
    mocks.stateSetters = [];
  });

  it('exposes the complete default UI state with stable setter references', async () => {
    const { useProfileListUIState } = await import('./useProfileListUIState');
    const hook = useProfileListUIState();

    expect(hook.drawerOpen).toBe(false);
    expect(hook.bulkCreateRuntime).toBe('auto');
    expect(hook.bulkCreateProxyId).toBeUndefined();
    expect(hook.importPackageFiles).toEqual([]);
    expect(hook.bulkEditGroup).toBe('');
    expect(hook.bulkEditClearGroup).toBe(false);
    expect(hook.bulkExtensionIds).toEqual([]);
    expect(hook.shortcutsOpen).toBe(false);
    expect(hook.wizardOpen).toBe(false);
    expect(hook.highlightedIndex).toBe(-1);
    expect(hook.selectedIds).toEqual([]);
    expect(hook.bulkProxySelection).toBeUndefined();
    expect(hook.searchRef).toBe(mocks.searchRef);
    expect(hook.setDrawerOpen).toBe(mocks.stateSetters[0]);
    expect(hook.setBulkCreateRuntime).toBe(mocks.stateSetters[4]);
    expect(hook.setImportPackageFiles).toBe(mocks.stateSetters[8]);
    expect(hook.setBulkExtensionCategories).toBe(mocks.stateSetters[21]);
    expect(hook.setSelectedIds).toBe(mocks.stateSetters[26]);
  });
});
