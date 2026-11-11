import type { ReactElement } from 'react';
import { locales, t, localePath, formatNumber, type Locale } from '../../i18n';
import { categoryByRoute, pick, categoryRoute, type CategoryRoute, type PostView, type Site } from '../../data/site';
import { categoryMeta, categoryOrder } from '../../lib/categories';
import { pageCount, pageItems, pagePath } from '../../lib/paginate';
import { absolute, alternatesFor, bothLocales, type Alternates } from '../../lib/routes';
import { cx } from '../cx';
import { CategoryIcon } from '../components/icons';
import { Pagination } from '../components/Pagination';
import { PostCard } from '../components/PostCard';
import type { PageResult } from './types';

interface ListingProps {
  site: Site;
  locale: Locale;
  posts: PostView[];
  page: number;
  /** Path of page 1, e.g. "/" or "/tech/". */
  base: string;
  /** Visible heading. Omit on home, which opens with a hero. */
  title?: string;
  description?: string;
  /** Alternates for page 1. */
  alternates?: Alternates;
  rss?: { href: string; title: string }[];
  structuredData?: object[];
  /** Larger first card on page 1. */
  featured?: boolean;
}

/** A paginated list of posts. Returns null for a page past the last (the router turns that into a 404). Ported from PostsPage.astro. */
export function postsPage({
  site,
  locale,
  posts,
  page,
  base,
  title,
  description,
  alternates = {},
  rss = [],
  structuredData = [],
  featured = true,
}: ListingProps): PageResult | null {
  const total = pageCount(posts.length, featured);
  if (page > total) return null;
  const items = pageItems(posts, page, featured);
  const showFeatured = featured && page === 1 && items.length > 0;
  const path = pagePath(locale, base, page);
  const pageLabel = page > 1 ? ` (${t(locale, 'pagination.page', { n: page })})` : '';
  const heading = title ?? site.siteName(locale);
  const hero = !title && page === 1;
  const tagline = pick(site.getSite().tagline, locale);
  const topics = [...new Map(posts.map((p) => [p.category.slug, p.category])).values()].map((c) => ({
    ...c,
    count: posts.filter((p) => p.category.slug === c.slug).length,
  }));
  const metaTitle = title ? `${title}${pageLabel}` : page > 1 ? t(locale, 'pagination.page', { n: page }) : heading;
  const siteName = site.siteName(locale);

  const body = (
    <div className="container listing">
      {title ? (
        <header className="page-head">
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-lede">{description}</p>}
        </header>
      ) : hero ? (
        <header className="hero">
          <p className="hero-eyebrow">{topics.map((c) => c.name).join(' · ') || t(locale, 'posts.description')}</p>
          <h1 className="hero-title">{heading}</h1>
          {tagline && <p className="hero-lead">{tagline}</p>}
          {topics.length > 1 && (
            <ul className="hero-topics" role="list">
              {topics.map((c) => (
                <li key={c.slug}>
                  <a className="topic-chip" data-topic={c.slug} href={localePath(locale, `/${categoryRoute[c.slug]}/`)}>
                    <CategoryIcon category={c.slug} size={18} />
                    {c.name}
                    <span className="topic-chip-count">{c.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </header>
      ) : (
        <h1 className="visually-hidden">{heading}</h1>
      )}
      {items.length === 0 ? (
        <div className="empty">
          <p>{t(locale, locale === 'en' ? 'posts.noPosts' : 'posts.noPostsLocale')}</p>
          {locale !== 'en' && (
            <p>
              <a className="btn" href={alternates.en ?? '/'} lang="en">
                {t('en', 'posts.readEnglish')}
              </a>
            </p>
          )}
        </div>
      ) : (
        <div className={cx('bento', showFeatured && 'has-feature', showFeatured && items.length < 5 && 'is-few')}>
          {items.map((post, i) => (
            <PostCard
              key={post.slug}
              post={post}
              locale={locale}
              siteName={siteName}
              featured={showFeatured && i === 0}
              eager={i < (showFeatured ? 1 : 2)}
            />
          ))}
        </div>
      )}
      <Pagination locale={locale} current={page} total={total} hrefFor={(n) => pagePath(locale, base, n)} />
    </div>
  );
  return {
    meta: {
      title: metaTitle,
      description: description ?? t(locale, 'posts.description'),
      locale,
      path,
      alternates: page === 1 ? alternates : { [locale]: path },
      noindex: items.length === 0,
      rss,
      structuredData,
    },
    body,
  };
}

export const homePage = (site: Site, locale: Locale, page: number) =>
  postsPage({
    site,
    locale,
    posts: site.getPosts(locale),
    page,
    base: '/',
    description: pick(site.getSite().tagline, locale) ?? t(locale, 'posts.description'),
    alternates: bothLocales('/'),
    rss: page === 1 ? [{ href: locale === 'en' ? '/rss.xml' : '/ja/rss.xml', title: site.siteName(locale) }] : [],
    structuredData:
      page === 1
        ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.siteName(locale), url: absolute('/'), inLanguage: locale }]
        : [],
  });

export function categoryPage(site: Site, locale: Locale, route: CategoryRoute, page: number) {
  const slug = categoryByRoute[route];
  const meta = categoryMeta[slug];
  return postsPage({
    site,
    locale,
    posts: site.getPosts(locale).filter((p) => p.category.slug === slug),
    page,
    base: `/${route}/`,
    title: t(locale, meta.label),
    description: t(locale, meta.description),
    alternates: bothLocales(`/${route}/`),
    rss: locale === 'en' ? [{ href: `/${route}/rss.xml`, title: `${t(locale, meta.label)} RSS` }] : [],
    featured: false,
  });
}

export function tagPage(site: Site, locale: Locale, tagSlug: string, page: number) {
  const tag = site.getUsedTags(locale).find((x) => x.slug === tagSlug);
  if (!tag) return null;
  return postsPage({
    site,
    locale,
    posts: site.getPosts(locale).filter((p) => p.tags.some((x) => x.slug === tag.slug)),
    page,
    base: `/tags/${tag.slug}/`,
    title: t(locale, 'tags.title', { tag: tag.name }),
    description: t(locale, 'tags.description', { tag: tag.name }),
    alternates: alternatesFor(
      `/tags/${tag.slug}/`,
      locales.filter((l) => site.getUsedTags(l).some((x) => x.slug === tag.slug)),
    ),
    featured: false,
  });
}

export function tagsIndexPage(site: Site, locale: Locale): PageResult {
  const tags = site.getUsedTags(locale);
  return {
    meta: {
      title: t(locale, 'taxonomy.tagsTitle'),
      description: t(locale, 'taxonomy.tagsDescription'),
      locale,
      path: localePath(locale, '/tags/'),
      alternates: bothLocales('/tags/'),
    },
    body: (
      <div className="container listing">
        <header className="page-head">
          <h1 className="page-title">{t(locale, 'taxonomy.tagsTitle')}</h1>
        </header>
        <ul className="pills" role="list">
          {tags.map((tag) => (
            <li key={tag.slug}>
              <a className="pill" href={localePath(locale, `/tags/${tag.slug}/`)}>
                #{tag.name}
                <span className="pill-count">{formatNumber(locale, tag.count)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    ),
  };
}

export function categoriesIndexPage(site: Site, locale: Locale): PageResult {
  const posts = site.getPosts(locale);
  return {
    meta: {
      title: t(locale, 'taxonomy.categoriesTitle'),
      description: t(locale, 'taxonomy.categoriesDescription'),
      locale,
      path: localePath(locale, '/categories/'),
      alternates: bothLocales('/categories/'),
    },
    body: (
      <div className="container listing">
        <header className="page-head">
          <h1 className="page-title">{t(locale, 'taxonomy.categoriesTitle')}</h1>
        </header>
        <ul className="pills" role="list">
          {categoryOrder.map((slug) => (
            <li key={slug}>
              <a className="pill" href={localePath(locale, `/${categoryMeta[slug].route}/`)}>
                <CategoryIcon category={slug} size={18} />
                {t(locale, categoryMeta[slug].label)}
                <span className="pill-count">{formatNumber(locale, posts.filter((p) => p.category.slug === slug).length)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    ),
  };
}

export type { ReactElement };
