import { describe, expect, it } from 'vitest';
import { getElectronStrings, resolveElectronLocale } from './localization';

describe('electron localization', () => {
  it('normalizes Vietnamese locales and falls back to English', () => {
    expect(resolveElectronLocale('vi-VN')).toBe('vi');
    expect(resolveElectronLocale('vi')).toBe('vi');
    expect(resolveElectronLocale('en-US')).toBe('en');
    expect(resolveElectronLocale(undefined)).toBe('en');
  });

  it('returns localized tray labels', () => {
    expect(getElectronStrings('vi-VN')).toMatchObject({
      trayOpen: 'Mở Pro5 Chrome Manager',
      trayQuit: 'Thoát',
    });
    expect(getElectronStrings('en-US')).toMatchObject({
      trayOpen: 'Open Pro5 Chrome Manager',
      trayQuit: 'Quit',
    });
  });
});
