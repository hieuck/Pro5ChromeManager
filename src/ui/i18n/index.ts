import vi from './vi';
import en from './en';
import { createPseudoLocale } from './pseudoLocale';
import {
  defaultLanguage,
  languageMeta,
  supportedLanguages,
  userFacingLanguages,
  type Language,
  type UserFacingLanguage,
} from '../../shared/i18n/locales';

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

export function isUserFacingLanguage(value: string | null | undefined): value is UserFacingLanguage {
  return Boolean(value) && userFacingLanguages.includes(value as UserFacingLanguage);
}

export function getTranslations(language: Language): TranslationKeys {
  return translations[language];
}

export function getTranslationsWithFallback(language: string | null | undefined): TranslationKeys {
  if (isSupportedLanguage(language)) {
    return translations[language];
  }
  return translations[defaultLanguage];
}

export {
  defaultLanguage,
  languageMeta,
  supportedLanguages,
  userFacingLanguages,
  type Language,
  type UserFacingLanguage,
};

export function formatMessage(
  template: string,
  variables: Record<string, string | number> = {},
): string {
  return Object.entries(variables).reduce((message, [key, value]) => (
    message.replaceAll(`{${key}}`, String(value))
  ), template);
}
