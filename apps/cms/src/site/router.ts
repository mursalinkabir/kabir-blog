// Which page a path is. Pure: no data, no I/O. A path that is not exactly canonical (a page number with a leading zero,
// page 1 of a listing, a segment that cannot be a slug) matches nothing, so each page has one URL and a crawler or a
// hostile client cannot make the site do unbounded work by inventing URLs.
import { locales, localePath, type Locale } from './i18n';
import type { CategoryRoute, Site } from './data/site';
import { categoryByRoute, categoryRoute } from './data/site';
import { pageCount, pagePath } from './lib/paginate';
import { bothLocales, alternatesFor, type Alternates } from './lib/routes';
import { SLUG_PATTERN } from '../hooks/slug';

export type Route =
  | { kind: 'home'; locale: Locale; page: number }
  | { kind: 'category'; locale: Locale; category: CategoryRoute; page: number }
  | { kind: 'tag'; locale: Locale; tag: string; page: number }
  | { kind: 'post' | 'project'; locale: Locale; slug: string }
  | {
      kind: 'projects' | 'tags' | 'categories' | 'about' | 'now' | 'uses' | 'resume' | 'contact' | 'contact-thanks' | 'search';
      locale: Locale;
    };

const MAX_PATH = 512;
const MAX_PAGE = 100_000;
const CATEGORIES: CategoryRoute[] = ['tech', 'finance', 'japan'];

/** `2`, `3`, `10`: no leading zero, no sign, no exponent, never 1 (page 1 is the base URL). */
function pageNumber(s: string | undefined): number | null {
  if (!s || !/^[1-9]\d{0,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 2 && n <= MAX_PAGE ? n : null;
}
const slug = (s: string | undefined): s is string => s !== undefined && SLUG_PATTERN.test(s);

export function matchRoute(pathname: string): Route | null {
  if (pathname.length > MAX_PATH || !pathname.startsWith('/') || !pathname.endsWith('/')) return null;
  const parts = pathname === '/' ? [] : pathname.slice(1, -1).split('/');
  if (parts.some((p) => p === '')) return null;
  let locale: Locale = 'en';
  if (parts[0] === 'ja') {
    locale = 'ja';
    parts.shift();
  }
  const [a, b, c, d] = parts;
  const n = parts.length;

  if (n === 0) return { kind: 'home', locale, page: 1 };
  if (a === 'page' && n === 2) {
    const page = pageNumber(b);
    return page ? { kind: 'home', locale, page } : null;
  }
  if (CATEGORIES.includes(a as CategoryRoute)) {
    const category = a as CategoryRoute;
    if (n === 1) return { kind: 'category', locale, category, page: 1 };
    if (n === 3 && b === 'page') {
      const page = pageNumber(c);
      return page ? { kind: 'category', locale, category, page } : null;
    }
    return null;
  }
  if (a === 'posts' && n === 2 && slug(b)) return { kind: 'post', locale, slug: b };
  if (a === 'projects') {
    if (n === 1) return { kind: 'projects', locale };
    if (n === 2 && slug(b)) return { kind: 'project', locale, slug: b };
    return null;
  }
  if (a === 'tags') {
    if (n === 1) return { kind: 'tags', locale };
    if (!slug(b)) return null;
    if (n === 2) return { kind: 'tag', locale, tag: b, page: 1 };
    if (n === 4 && c === 'page') {
      const page = pageNumber(d);
      return page ? { kind: 'tag', locale, tag: b, page } : null;
    }
    return null;
  }
  if (
    n === 1 &&
    (a === 'categories' || a === 'about' || a === 'now' || a === 'uses' || a === 'resume' || a === 'contact' || a === 'search')
  ) {
    return { kind: a, locale };
  }
  if (n === 2 && a === 'contact' && b === 'thanks') return { kind: 'contact-thanks', locale };
  return null;
}

export interface ListedPath {
  path: string;
  locale: Locale;
  noindex: boolean;
  /** The newest date among the documents the page shows (posts only). */
  lastmod?: string;
  alternates: Alternates;
}

/** Every path the site serves as a page, for the sitemap and the parity test. */
export function listPaths(site: Site): ListedPath[] {
  const out: ListedPath[] = [];
  const add = (p: Omit<ListedPath, 'noindex'> & { noindex?: boolean }) => out.push({ noindex: false, ...p });
  const pages = (locale: Locale, base: string, total: number, alternates: Alternates) => {
    for (let n = 1; n <= total; n++) {
      const path = pagePath(locale, base, n);
      add({ path, locale, alternates: n === 1 ? alternates : { [locale]: path } });
    }
  };
  for (const locale of locales) {
    const posts = site.getPosts(locale);
    pages(locale, '/', pageCount(posts.length, true), bothLocales('/'));
    for (const route of CATEGORIES) {
      const count = posts.filter((p) => p.category.slug === categoryByRoute[route]).length;
      pages(locale, `/${route}/`, pageCount(count, false), bothLocales(`/${route}/`));
    }
    for (const tag of site.getUsedTags(locale)) {
      const langs = locales.filter((l) => site.getUsedTags(l).some((x) => x.slug === tag.slug));
      pages(locale, `/tags/${tag.slug}/`, pageCount(tag.count, false), alternatesFor(`/tags/${tag.slug}/`, langs));
    }
    for (const post of posts) {
      add({
        path: localePath(locale, `/posts/${post.slug}/`),
        locale,
        lastmod: post.updatedDate ?? post.pubDate,
        alternates: alternatesFor(`/posts/${post.slug}/`, post.available),
      });
    }
    for (const p of site.getProjects(locale)) {
      add({ path: localePath(locale, `/projects/${p.slug}/`), locale, alternates: alternatesFor(`/projects/${p.slug}/`, p.available) });
    }
    add({ path: localePath(locale, '/projects/'), locale, alternates: bothLocales('/projects/') });
    add({ path: localePath(locale, '/tags/'), locale, alternates: bothLocales('/tags/') });
    add({ path: localePath(locale, '/categories/'), locale, alternates: bothLocales('/categories/') });
    add({ path: localePath(locale, '/contact/'), locale, alternates: bothLocales('/contact/') });
    add({ path: localePath(locale, '/contact/thanks/'), locale, noindex: true, alternates: {} });
    if (site.sectionLocales.about().includes(locale))
      add({ path: localePath(locale, '/about/'), locale, alternates: alternatesFor('/about/', site.sectionLocales.about()) });
    if (site.sectionLocales.now().includes(locale))
      add({ path: localePath(locale, '/now/'), locale, alternates: alternatesFor('/now/', site.sectionLocales.now()) });
    if (site.sectionLocales.uses().includes(locale))
      add({ path: localePath(locale, '/uses/'), locale, alternates: alternatesFor('/uses/', site.sectionLocales.uses()) });
    if (locale === 'en') add({ path: '/resume/', locale, alternates: { en: '/resume/' } });
  }
  void categoryRoute;
  return out;
}
