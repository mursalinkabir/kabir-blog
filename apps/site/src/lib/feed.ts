import rss from '@astrojs/rss';
import { getPosts, getSite, pick, siteName } from './cms';
import { lexicalToFeedHtml } from './lexical/feed';
import { SITE } from './routes';
import { localePath, t } from '~/i18n';
import type { Category } from './types';
import { categoryMeta } from './categories';

export function categoryFeed(category: Category['slug']) {
  const locale = 'en';
  const label = t(locale, categoryMeta[category].label);
  return rss({
    title: `${siteName(locale)}: ${label}`,
    description: pick(getSite().tagline, locale) ?? label,
    site: SITE,
    trailingSlash: true,
    customData: `<language>${locale}</language>`,
    items: getPosts(locale)
      .filter((p) => p.category.slug === category)
      .map((post) => ({
        title: post.title,
        description: post.description,
        link: localePath(locale, `/posts/${post.slug}/`),
        pubDate: new Date(post.pubDate),
        content: lexicalToFeedHtml(post.content, SITE, locale),
      })),
  });
}
