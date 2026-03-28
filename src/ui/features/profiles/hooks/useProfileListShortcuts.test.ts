import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanup: undefined as void | (() => void),
  keydownHandler: null as null | ((event: KeyboardEvent & { target: { tagName: string } }) => void),
  removeEventListener: vi.fn(),
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    mocks.cleanup = effect() ?? undefined;
  },
}));

describe('useProfileListShortcuts', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.cleanup = undefined;
    mocks.keydownHandler = null;
    mocks.removeEventListener.mockReset();
    vi.stubGlobal('window', {
      addEventListener: vi.fn((_event: string, handler: (event: KeyboardEvent) => void) => {
        mocks.keydownHandler = handler as typeof mocks.keydownHandler;
      }),
      removeEventListener: mocks.removeEventListener,
    });
  });

  it('registers keyboard handlers and unregisters them on cleanup', async () => {
    const { useProfileListShortcuts } = await import('./useProfileListShortcuts');
    useProfileListShortcuts(
      {
        drawerOpen: false,
        setDrawerOpen: vi.fn(),
        shortcutsOpen: false,
        setShortcutsOpen: vi.fn(),
        highlightedIndex: -1,
        setHighlightedIndex: vi.fn(),
        searchRef: { current: null },
      },
      { openCreate: vi.fn(), openEdit: vi.fn() },
      { filtered: [] },
    );

    expect(mocks.keydownHandler).toBeTypeOf('function');

    mocks.cleanup?.();

    expect(mocks.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('handles create, search, shortcuts, escape, navigation, and edit keyboard flows', async () => {
    const focus = vi.fn();
    const setDrawerOpen = vi.fn();
    const setShortcutsOpen = vi.fn();
    const setHighlightedIndex = vi.fn();
    const openCreate = vi.fn();
    const openEdit = vi.fn();
    const { useProfileListShortcuts } = await import('./useProfileListShortcuts');

    useProfileListShortcuts(
      {
        drawerOpen: true,
        setDrawerOpen,
        shortcutsOpen: false,
        setShortcutsOpen,
        highlightedIndex: 0,
        setHighlightedIndex,
        searchRef: { current: { focus } },
      },
      { openCreate, openEdit },
      { filtered: [{ id: 'profile-1' }, { id: 'profile-2' }] },
    );

    const preventDefault = vi.fn();
    mocks.keydownHandler?.({ ctrlKey: true, key: 'n', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });
    mocks.keydownHandler?.({ ctrlKey: true, key: 'f', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });
    mocks.keydownHandler?.({ ctrlKey: false, key: '?', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });
    mocks.keydownHandler?.({ ctrlKey: false, key: 'Escape', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });
    mocks.keydownHandler?.({ ctrlKey: false, key: 'ArrowDown', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });
    mocks.keydownHandler?.({ ctrlKey: false, key: 'ArrowUp', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });
    mocks.keydownHandler?.({ ctrlKey: false, key: 'Enter', preventDefault, target: { tagName: 'DIV' } } as KeyboardEvent & { target: { tagName: string } });

    expect(openCreate).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(setShortcutsOpen).toHaveBeenCalledWith(true);
    expect(setDrawerOpen).toHaveBeenCalledWith(false);
    expect(openEdit).toHaveBeenCalledWith('profile-1');

    const downUpdater = setHighlightedIndex.mock.calls[0]?.[0] as (current: number) => number;
    const upUpdater = setHighlightedIndex.mock.calls[1]?.[0] as (current: number) => number;
    expect(downUpdater(0)).toBe(1);
    expect(upUpdater(1)).toBe(0);
  });

  it('ignores non-control shortcuts when focus is already inside an input', async () => {
    const setShortcutsOpen = vi.fn();
    const { useProfileListShortcuts } = await import('./useProfileListShortcuts');

    useProfileListShortcuts(
      {
        drawerOpen: false,
        setDrawerOpen: vi.fn(),
        shortcutsOpen: false,
        setShortcutsOpen,
        highlightedIndex: -1,
        setHighlightedIndex: vi.fn(),
        searchRef: { current: null },
      },
      { openCreate: vi.fn(), openEdit: vi.fn() },
      { filtered: [] },
    );

    mocks.keydownHandler?.({ ctrlKey: false, key: '?', preventDefault: vi.fn(), target: { tagName: 'INPUT' } } as KeyboardEvent & { target: { tagName: string } });

    expect(setShortcutsOpen).not.toHaveBeenCalled();
  });
});
