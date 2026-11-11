import type { Locale } from '../i18n';
import { localePath, t } from '../i18n';
import { categoryMeta } from '../lib/categories';
import { lexicalToFeedHtml } from '../lib/lexical/feed';
import { SITE } from '../lib/routes';
import { categoryByRoute, pick, type CategoryRoute, type PostView, type Site } from '../data/site';
import { xml } from './respond';

// Same element order as the Astro feed: the categories (category and tags) follow the content. Category feeds have none.
const item = (post: PostView, locale: Locale, withCategories: boolean) =>
  `<item><title>${xml(post.title)}</title><link>${SITE}${localePath(locale, `/posts/${post.slug}/`)}</link>` +
  `<guid isPermaLink="true">${SITE}${localePath(locale, `/posts/${post.slug}/`)}</guid><description>${xml(post.description)}</description>` +
  `<pubDate>${new Date(post.pubDate).toUTCString()}</pubDate>` +
  `<content:encoded>${xml(lexicalToFeedHtml(post.content, SITE, locale))}</content:encoded>` +
  (withCategories ? [post.category.name, ...post.tags.map((t) => t.name)].map((c) => `<category>${xml(c)}</category>`).join('') : '') +
  `</item>`;

const wrap = (title: string, description: string, locale: Locale, items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>` +
  `<title>${xml(title)}</title><description>${xml(description)}</description><link>${SITE}/</link><language>${locale}</language>${items}</channel></rss>`;

/** The full-content feed of one locale: /rss.xml and /ja/rss.xml. */
export function rssXml(site: Site, locale: Locale): string {
  const name = site.siteName(locale);
  return wrap(
    name,
    pick(site.getSite().tagline, locale) ?? name,
    locale,
    site
      .getPosts(locale)
      .map((p) => item(p, locale, true))
      .join(''),
  );
}

/** One category's feed, English only: /tech/rss.xml, /finance/rss.xml, /japan/rss.xml. */
export function categoryRssXml(site: Site, route: CategoryRoute): string {
  const locale: Locale = 'en';
  const slug = categoryByRoute[route];
  const label = t(locale, categoryMeta[slug].label);
  return wrap(
    `${site.siteName(locale)}: ${label}`,
    pick(site.getSite().tagline, locale) ?? label,
    locale,
    site
      .getPosts(locale)
      .filter((p) => p.category.slug === slug)
      .map((p) => item(p, locale, false))
      .join(''),
  );
}
