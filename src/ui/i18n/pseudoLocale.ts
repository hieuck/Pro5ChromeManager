import type vi from './vi';

type TranslationKeys = typeof vi;

const accentMap: Record<string, string> = {
  a: 'á',
  A: 'Á',
  b: 'ƀ',
  B: 'Ƀ',
  c: 'ç',
  C: 'Ç',
  d: 'đ',
  D: 'Đ',
  e: 'ë',
  E: 'Ë',
  f: 'ƒ',
  F: 'Ƒ',
  g: 'ğ',
  G: 'Ğ',
  h: 'ħ',
  H: 'Ħ',
  i: 'ï',
  I: 'Ï',
  j: 'ĵ',
  J: 'Ĵ',
  k: 'ķ',
  K: 'Ķ',
  l: 'ľ',
  L: 'Ľ',
  m: 'm',
  M: 'M',
  n: 'ñ',
  N: 'Ñ',
  o: 'õ',
  O: 'Õ',
  p: 'þ',
  P: 'Þ',
  q: 'ʠ',
  Q: 'Ɋ',
  r: 'ř',
  R: 'Ř',
  s: 'š',
  S: 'Š',
  t: 'ŧ',
  T: 'Ŧ',
  u: 'ü',
  U: 'Ü',
  v: 'ṽ',
  V: 'Ṽ',
  w: 'ŵ',
  W: 'Ŵ',
  x: 'ẋ',
  X: 'Ẋ',
  y: 'ÿ',
  Y: 'Ÿ',
  z: 'ž',
  Z: 'Ž',
};

function pseudoLocalizeText(input: string): string {
  const tokens = input.split(/(\{[^}]+\})/g);
  const localized = tokens.map((token) => {
    if (token.startsWith('{') && token.endsWith('}')) {
      return token;
    }
    return token
      .split('')
      .map((character) => accentMap[character] ?? character)
      .join('');
  }).join('');

  return `［${localized}］`;
}

function mapStringsDeep<T>(value: T, transform: (text: string) => string): T {
  if (typeof value === 'string') {
    return transform(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => mapStringsDeep(entry, transform)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, mapStringsDeep(entry, transform)]),
    ) as T;
  }
  return value;
}

export function createPseudoLocale(source: TranslationKeys): TranslationKeys {
  return mapStringsDeep(source, pseudoLocalizeText);
}
