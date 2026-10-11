import en from './en.json';
import ja from './ja.json';

export const locales = ['en', 'ja'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

// `ja` must have exactly the keys of `en`; a missing key is a type error (astro check)
// and also fails `scripts/check-i18n.mjs` during the build.
type Strings = typeof en;
const tables: Record<Locale, Strings> = { en, ja };

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type StringKey = Paths<Strings>;

export function t(locale: Locale, key: StringKey, vars: Record<string, string | number> = {}): string {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], tables[locale]);
  return String(value).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Raw sub-tree (e.g. the Pagefind translation block). */
export function section<K extends keyof Strings>(locale: Locale, key: K): Strings[K] {
  return tables[locale][key];
}

/** Dates are the author's calendar days, not the build machine's. */
export const SITE_TIME_ZONE = 'Asia/Tokyo';

export const htmlLang: Record<Locale, string> = { en: 'en', ja: 'ja' };
export const intlLocale: Record<Locale, string> = { en: 'en-GB', ja: 'ja-JP' };
export const ogLocale: Record<Locale, string> = { en: 'en_GB', ja: 'ja_JP' };

/** Prefix a site path for a locale. English has no prefix; Japanese lives under /ja/. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return locale === defaultLocale ? clean : `/ja${clean === '/' ? '/' : clean}`;
}

export function formatDate(locale: Locale, date: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: SITE_TIME_ZONE,
    ...opts,
  }).format(typeof date === 'string' ? new Date(date) : date);
}

export const formatNumber = (locale: Locale, n: number): string => new Intl.NumberFormat(intlLocale[locale]).format(n);
