import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { siteName, getSite, pick, getPosts } from '~/lib/cms';
import { lexicalToFeedHtml } from '~/lib/lexical/feed';
import { SITE, perLocale } from '~/lib/routes';
import { localePath, type Locale } from '~/i18n';

export const getStaticPaths = () => perLocale(() => [{}]);

export function GET(context: APIContext & { props: { locale: Locale } }) {
  const { locale } = context.props;
  return rss({
    title: siteName(locale),
    description: pick(getSite().tagline, locale) ?? siteName(locale),
    site: SITE,
    trailingSlash: true,
    customData: `<language>${locale}</language>`,
    items: getPosts(locale).map((post) => ({
      title: post.title,
      description: post.description,
      link: localePath(locale, `/posts/${post.slug}/`),
      pubDate: new Date(post.pubDate),
      categories: [post.category.name, ...post.tags.map((t) => t.name)],
      content: lexicalToFeedHtml(post.content, SITE, locale),
    })),
  });
}
