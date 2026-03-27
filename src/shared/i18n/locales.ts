export const supportedLanguages = ['vi', 'en', 'qps-ploc'] as const;

export type Language = typeof supportedLanguages[number];
export type UserFacingLanguage = Exclude<Language, 'qps-ploc'>;

export const defaultLanguage: Language = 'vi';
export const userFacingLanguages = ['vi', 'en'] as const satisfies readonly UserFacingLanguage[];

export const languageMeta: Record<Language, { nativeLabel: string; shortLabel: string }> = {
  vi: {
    nativeLabel: 'Tiếng Việt',
    shortLabel: 'VI',
  },
  en: {
    nativeLabel: 'English',
    shortLabel: 'EN',
  },
  'qps-ploc': {
    nativeLabel: 'Pseudo',
    shortLabel: 'QPS',
  },
};
