import { useMemo } from 'react';
import {
  defaultLanguage,
  formatMessage,
  getTranslations,
  isSupportedLanguage,
  isUserFacingLanguage,
  type Language,
  type TranslationKeys,
} from '../../i18n';

/**
 * Reads uiLanguage from localStorage (synced from config.uiLanguage).
 * Falls back to 'vi' if not set or invalid.
 */
function getLanguage(): Language {
  const stored = localStorage.getItem('uiLanguage');
  if (import.meta.env.DEV && isSupportedLanguage(stored)) return stored;
  if (isUserFacingLanguage(stored)) return stored;
  return defaultLanguage;
}

export function useTranslation(): {
  t: TranslationKeys;
  lang: Language;
  format: typeof formatMessage;
} {
  const lang = getLanguage();
  const t = useMemo(() => getTranslations(lang), [lang]);
  return { t, lang, format: formatMessage };
}
