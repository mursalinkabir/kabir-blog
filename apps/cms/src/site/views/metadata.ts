import type { Metadata } from 'next';
import { htmlLang, locales, ogLocale } from '../i18n';
import { absolute } from '../lib/routes';
import type { Site } from '../data/site';
import type { PageMeta } from './pages/types';

/** Turns what a page says about itself into Next's metadata (the <head>). Ported from BaseLayout.astro. */
export function toMetadata(meta: PageMeta, site: Site): Metadata {
  const { locale, path, alternates = {}, rss = [], type = 'website' } = meta;
  const name = site.siteName(locale);
  const title = path === '/' || path === '/ja/' ? name : `${meta.title} · ${name}`;
  const canonical = absolute(path);
  const entries = Object.entries(alternates) as [(typeof locales)[number], string][];
  const languages =
    entries.length > 1
      ? {
          ...Object.fromEntries(entries.map(([l, p]) => [htmlLang[l], absolute(p)])),
          ...(alternates.en ? { 'x-default': absolute(alternates.en) } : {}),
        }
      : undefined;
  return {
    title: { absolute: title },
    description: meta.description,
    alternates: {
      canonical,
      ...(languages ? { languages } : {}),
      ...(rss.length ? { types: { 'application/rss+xml': rss.map((r) => ({ url: r.href, title: r.title })) } } : {}),
    },
    robots: meta.noindex ? { index: false } : undefined,
    openGraph: {
      siteName: name,
      title: meta.title,
      description: meta.description,
      type,
      url: canonical,
      locale: ogLocale[locale],
      alternateLocale: locales.filter((l) => l !== locale && alternates[l]).map((l) => ogLocale[l]),
      ...(meta.publishedTime ? { publishedTime: meta.publishedTime } : {}),
      ...(meta.modifiedTime ? { modifiedTime: meta.modifiedTime } : {}),
      ...(meta.image ? { images: [meta.image] } : {}),
    } as Metadata['openGraph'],
    twitter: { card: meta.image ? 'summary_large_image' : 'summary', ...(meta.image ? { images: [meta.image] } : {}) },
    icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  };
}
