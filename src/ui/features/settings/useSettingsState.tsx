import { useTranslation } from '../../hooks/useTranslation';
import { useSettingsSupport } from './useSettingsSupport';
import { useSettingsWorkspace } from './useSettingsWorkspace';

export function useSettingsState() {
  const { t } = useTranslation();
  const workspaceState = useSettingsWorkspace(t);
  const supportState = useSettingsSupport(t);

  return {
    t,
    ...workspaceState,
    ...supportState,
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
