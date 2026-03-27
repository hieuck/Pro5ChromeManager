import { describe, expect, it } from 'vitest';
import {
  defaultLanguage,
  formatMessage,
  getTranslations,
  getTranslationsWithFallback,
  isSupportedLanguage,
  isUserFacingLanguage,
  supportedLanguages,
  userFacingLanguages,
} from './index';

describe('i18n registry', () => {
  it('exposes supported languages and a valid default language', () => {
    expect(supportedLanguages).toContain('vi');
    expect(supportedLanguages).toContain('en');
    expect(supportedLanguages).toContain('qps-ploc');
    expect(userFacingLanguages).toEqual(['vi', 'en']);
    expect(isSupportedLanguage(defaultLanguage)).toBe(true);
  });

  it('returns translations for a supported language', () => {
    const vi = getTranslations('vi');
    const en = getTranslations('en');
    const pseudo = getTranslations('qps-ploc');

    expect(vi.profile.title).toBeTruthy();
    expect(en.profile.title).toBeTruthy();
    expect(pseudo.profile.title).toContain('［');
  });

  it('formats template variables', () => {
    expect(formatMessage('Updated {total} profiles', { total: 3 })).toBe('Updated 3 profiles');
    expect(formatMessage('{count} minutes ago', { count: 5 })).toBe('5 minutes ago');
  });

  it('detects unsupported languages', () => {
    expect(isSupportedLanguage('jp')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
    expect(isUserFacingLanguage('qps-ploc')).toBe(false);
    expect(isUserFacingLanguage('en')).toBe(true);
  });

  it('falls back to default language for unsupported or empty values', () => {
    const fallback = getTranslations(defaultLanguage);
    expect(getTranslationsWithFallback('unknown-locale')).toBe(fallback);
    expect(getTranslationsWithFallback(undefined)).toBe(fallback);
    expect(getTranslationsWithFallback('en')).toBe(getTranslations('en'));
  });

  it('keeps placeholder tokens intact in the pseudo locale', () => {
    const pseudo = getTranslations('qps-ploc');

    expect(pseudo.profile.bulkEditSuccess).toContain('{total}');
    expect(pseudo.profile.bulkEditSuccess).toContain('［');
  });
});
