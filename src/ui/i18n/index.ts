import vi from './vi';
import en from './en';
import { createPseudoLocale } from './pseudoLocale';
import {
  defaultLanguage,
  languageMeta,
  supportedLanguages,
  type Language,
} from '../../server/shared/locales';

const qpsPloc = createPseudoLocale(en);

export const translations = {
  vi,
  en,
  'qps-ploc': qpsPloc,
} as const;

export type TranslationKeys = typeof vi;

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return Boolean(value) && supportedLanguages.includes(value as Language);
}

export function getTranslations(language: Language): TranslationKeys {
  return translations[language];
}

export { defaultLanguage, languageMeta, supportedLanguages, type Language };

export function formatMessage(
  template: string,
  variables: Record<string, string | number> = {},
): string {
  return Object.entries(variables).reduce((message, [key, value]) => (
    message.replaceAll(`{${key}}`, String(value))
  ), template);
}
