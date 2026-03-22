import { useMemo } from 'react';
import vi, { TranslationKeys } from '../i18n/vi';
import en from '../i18n/en';

type Language = 'vi' | 'en';

const translations: Record<Language, TranslationKeys> = { vi, en };

/**
 * Reads uiLanguage from localStorage (synced from config.uiLanguage).
 * Falls back to 'vi' if not set or invalid.
 */
function getLanguage(): Language {
  const stored = localStorage.getItem('uiLanguage');
  if (stored === 'vi' || stored === 'en') return stored;
  return 'vi';
}

export function useTranslation(): { t: TranslationKeys; lang: Language } {
  const lang = getLanguage();
  const t = useMemo(() => translations[lang], [lang]);
  return { t, lang };
}
