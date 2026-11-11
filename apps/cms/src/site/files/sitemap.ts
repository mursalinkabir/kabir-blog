import { htmlLang, type Locale } from '../i18n';
import { SITE } from '../lib/routes';
import { listPaths } from '../router';
import type { Site } from '../data/site';
import { xml } from './respond';

export const sitemapIndexXml = (): string =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE}/sitemap-0.xml</loc></sitemap></sitemapindex>`;

/**
 * Every indexable page once, sorted by address, with `lastmod` for posts. Pages marked noindex are left out. A page is
 * paired with its counterpart in the other language whenever that URL exists (the same rule @astrojs/sitemap applied),
 * including later pages of a listing.
 */
export function sitemapXml(site: Site): string {
  const all = listPaths(site).filter((p) => !p.noindex);
  const known = new Set(all.map((p) => p.path));
  const counterpart = (path: string, locale: Locale) => (locale === 'en' ? `/ja${path}` : path.replace(/^\/ja/, '') || '/');
  const urls = all
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((p) => {
      const other = counterpart(p.path, p.locale);
      const alts: [Locale, string][] = known.has(other)
        ? (
            [
              [p.locale, p.path],
              [p.locale === 'en' ? 'ja' : 'en', other],
            ] as [Locale, string][]
          ).sort((a, b) => (a[0] === 'en' ? -1 : 1) - (b[0] === 'en' ? -1 : 1))
        : [];
      return (
        `<url><loc>${xml(SITE + p.path)}</loc>` +
        (p.lastmod ? `<lastmod>${xml(new Date(p.lastmod).toISOString())}</lastmod>` : '') +
        (alts.length > 1
          ? alts.map(([l, href]) => `<xhtml:link rel="alternate" hreflang="${htmlLang[l]}" href="${xml(SITE + href)}"/>`).join('')
          : '') +
        `</url>`
      );
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}
