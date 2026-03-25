import { useEffect } from 'react';

export function useProfileListShortcuts(
  ui: any,
  actions: any,
  filters: any
) {
  const { 
    drawerOpen, setDrawerOpen, shortcutsOpen, setShortcutsOpen, 
    highlightedIndex, setHighlightedIndex, searchRef 
  } = ui;
  const { openCreate, openEdit } = actions;
  const { filtered } = filters;

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

      if (isInput) return;

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
        setHighlightedIndex((current: number) => Math.min(current + 1, filtered.length - 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((current: number) => Math.max(current - 1, 0));
      }

      if (event.key === 'Enter' && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        openEdit(filtered[highlightedIndex].id);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, filtered, highlightedIndex, openCreate, openEdit, searchRef, setDrawerOpen, setHighlightedIndex, setShortcutsOpen, shortcutsOpen]);
}
