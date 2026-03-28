import { ELECTRON_APP_NAME, SUPPORTED_ELECTRON_LOCALES } from './constants';

export type ElectronStrings = {
  readonly trayTooltip: string;
  readonly trayOpen: string;
  readonly trayQuit: string;
  readonly windowTitle: string;
};

const ELECTRON_STRINGS: Record<string, ElectronStrings> = {
  [SUPPORTED_ELECTRON_LOCALES.english]: {
    trayTooltip: ELECTRON_APP_NAME,
    trayOpen: `Open ${ELECTRON_APP_NAME}`,
    trayQuit: 'Quit',
    windowTitle: ELECTRON_APP_NAME,
  },
  [SUPPORTED_ELECTRON_LOCALES.vietnamese]: {
    trayTooltip: ELECTRON_APP_NAME,
    trayOpen: `Mở ${ELECTRON_APP_NAME}`,
    trayQuit: 'Thoát',
    windowTitle: ELECTRON_APP_NAME,
  },
};

export function resolveElectronLocale(locale?: string): string {
  const normalizedLocale = locale?.trim().toLowerCase();
  if (normalizedLocale?.startsWith(SUPPORTED_ELECTRON_LOCALES.vietnamese)) {
    return SUPPORTED_ELECTRON_LOCALES.vietnamese;
  }

  return SUPPORTED_ELECTRON_LOCALES.english;
}

export function getElectronStrings(locale?: string): ElectronStrings {
  return ELECTRON_STRINGS[resolveElectronLocale(locale)];
}
