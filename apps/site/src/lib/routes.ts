import { locales, localePath, type Locale } from '~/i18n';

/** `[...locale]` rest param: English has no prefix (undefined), Japanese is "ja". */
export const localeParam = (locale: Locale) => ({ locale: locale === 'en' ? undefined : locale });

/** Expand one static path per locale in `only` (default: all) with extra params and props. */
export function perLocale<P extends Record<string, unknown>, Q extends Record<string, unknown>>(
  build: (locale: Locale) => { params?: P; props?: Q }[],
  only: readonly Locale[] = locales,
) {
  return only.flatMap((locale) =>
    build(locale).map(({ params, props }) => ({ params: { ...localeParam(locale), ...params }, props: { locale, ...props } })),
  );
}

export type Alternates = Partial<Record<Locale, string>>;

/** Alternate URLs for pages that exist in every locale. */
export const bothLocales = (path: string): Alternates => Object.fromEntries(locales.map((l) => [l, localePath(l, path)]));

/** Alternate URLs restricted to the locales in which the page exists. */
export const alternatesFor = (path: string, available: readonly Locale[]): Alternates =>
  Object.fromEntries(available.map((l) => [l, localePath(l, path)]));

export const SITE = 'https://smkabir.com';
export const absolute = (path: string) => new URL(path, SITE).toString();

/** Initials for the avatar monogram: first letter (grapheme) of the first two words. A Japanese name has a middle dot, not a space, between parts. */
export function initials(name: string): string {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return name
    .split(/[\s・･]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...seg.segment(w)][0]?.segment ?? '')
    .join('');
}
