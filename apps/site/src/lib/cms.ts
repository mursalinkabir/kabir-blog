// Content access. Content comes from one of two directories with the same layout:
//   src/content/cms/       pulled from Payload by `pnpm cms:pull` (git-ignored; what production builds read)
//   src/content/fixtures/  committed sample content (used when nothing has been pulled, and by the tests)
// Pages never know which one they got: `contentSource` only drives the sample-content banner.
import { defaultLocale, locales, type Locale } from '~/i18n';
import type { Category, Localized, Media, NowGlobal, Page, Post, Project, ResumeGlobal, SiteGlobal, UsesGlobal } from './types';
import type { LexicalRoot } from './lexical/types';
import { headings, isEmptyDoc, readingMinutes, type Heading } from './lexical/walk';

const cmsFiles = import.meta.glob('../content/cms/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const fixtureFiles = import.meta.glob('../content/fixtures/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

// SITE_CONTENT=cms|fixtures forces a source. Unset: use what was pulled, else the fixtures. A release build sets
// SITE_CONTENT=cms so a failed pull can never quietly publish sample content.
const wanted = process.env.SITE_CONTENT;
if (wanted && wanted !== 'cms' && wanted !== 'fixtures') throw new Error(`SITE_CONTENT must be "cms" or "fixtures", got "${wanted}"`);
const havePulled = Object.keys(cmsFiles).some((p) => p.endsWith('/site.json'));
if (wanted === 'cms' && !havePulled) throw new Error('SITE_CONTENT=cms but src/content/cms is empty. Run `pnpm cms:pull` first.');

export const contentSource: 'cms' | 'fixtures' = wanted === 'fixtures' ? 'fixtures' : havePulled ? 'cms' : 'fixtures';

const [files, base] = contentSource === 'cms' ? [cmsFiles, '../content/cms'] : [fixtureFiles, '../content/fixtures'];
const one = <T>(name: string): T => {
  const hit = files[`${base}/${name}.json`];
  if (hit === undefined) throw new Error(`Missing ${contentSource} file ${name}.json`);
  return hit as T;
};
const many = <T>(dir: string): T[] =>
  Object.entries(files)
    .filter(([path]) => path.startsWith(`${base}/${dir}/`))
    .map(([, v]) => v as T);

/** Localized field lookup. There is deliberately no fallback to another locale. */
export const pick = <T>(field: Localized<T> | undefined, locale: Locale): T | undefined => {
  const v = field?.[locale];
  return v === '' || v === null ? undefined : v;
};

export const getSite = () => one<SiteGlobal>('site');
export const getNow = () => one<NowGlobal>('now');
const getUses = () => one<UsesGlobal>('uses');
export const getResume = () => one<ResumeGlobal>('resume');

export const siteName = (locale: Locale) => pick(getSite().name, locale) ?? pick(getSite().name, defaultLocale) ?? 'smkabir.com';

// ---- localized views -------------------------------------------------------------------------

export interface PostView {
  slug: string;
  locale: Locale;
  title: string;
  description: string;
  content: LexicalRoot;
  headings: Heading[];
  readingMinutes: number;
  pubDate: string;
  updatedDate?: string;
  category: { slug: Category['slug']; name: string };
  tags: { slug: string; name: string }[];
  hero?: Media;
  series?: Post['series'];
  toc: boolean;
  /** Locales in which this same post has a page, for hreflang and the language switcher. */
  available: Locale[];
}

/** A localized rich-text value counts as present only when it has something in it (an untouched editor does not). */
const hasContent = (doc: LexicalRoot | undefined): boolean => Boolean(doc) && !isEmptyDoc(doc!);

/**
 * Published, visible in `locale`, and every required localized field present: title, description, non-empty content
 * and, when the post has a cover, that cover's alt text in this locale. Otherwise: no page, never another language.
 */
export function hasPage(post: Post, locale: Locale): boolean {
  return (
    post._status === 'published' &&
    post.publishedIn[locale] === true &&
    Boolean(pick(post.title, locale)) &&
    Boolean(pick(post.description, locale)) &&
    hasContent(pick(post.content, locale)) &&
    (!post.hero || Boolean(pick(post.hero.alt, locale)))
  );
}

let postsCache: Post[] | undefined;
function allPosts(): Post[] {
  if (!postsCache) {
    postsCache = many<Post>('posts');
    // Never ship a site with zero posts because the CMS (or Access, or the tunnel) hiccupped.
    if (!postsCache.some((p) => p._status === 'published')) throw new Error('CMS returned zero published posts; refusing to build.');
  }
  return postsCache;
}

const postViews = new Map<Locale, PostView[]>();

/** A category must be named in every locale it is shown in: a missing name is a content error, not a slug. */
function categoryName(category: Category, locale: Locale): string {
  const name = pick(category.name, locale);
  if (!name) throw new Error(`Category "${category.slug}" has no ${locale} name`);
  return name;
}

export function getPosts(locale: Locale): PostView[] {
  const cached = postViews.get(locale);
  if (cached) return cached;
  const views = buildPosts(locale);
  postViews.set(locale, views);
  return views;
}

function buildPosts(locale: Locale): PostView[] {
  return allPosts()
    .filter((p) => hasPage(p, locale))
    .map((p) => {
      const content = pick(p.content, locale)!;
      return {
        slug: p.slug,
        locale,
        title: pick(p.title, locale)!,
        description: pick(p.description, locale)!,
        content,
        headings: headings(content),
        readingMinutes: readingMinutes(content),
        pubDate: p.pubDate,
        updatedDate: p.updatedDate,
        category: { slug: p.category.slug, name: categoryName(p.category, locale) },
        tags: p.tags.flatMap((t) => {
          const name = pick(t.name, locale);
          return name ? [{ slug: t.slug, name }] : [];
        }),
        hero: p.hero,
        series: p.series,
        toc: p.toc,
        available: locales.filter((l) => hasPage(p, l)),
      } satisfies PostView;
    })
    .sort((a, b) => b.pubDate.localeCompare(a.pubDate));
}

export interface ProjectView {
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  content: LexicalRoot;
  status: Project['status'];
  stack: string[];
  repo?: string;
  links: Project['links'];
  featured: boolean;
  order: number;
  hero?: Media;
  available: Locale[];
}

const projectHasPage = (p: Project, l: Locale) =>
  p._status === 'published' && Boolean(pick(p.title, l)) && Boolean(pick(p.summary, l)) && hasContent(pick(p.content, l));

export function getProjects(locale: Locale): ProjectView[] {
  return many<Project>('projects')
    .filter((p) => projectHasPage(p, locale))
    .map((p) => ({
      slug: p.slug,
      locale,
      title: pick(p.title, locale)!,
      summary: pick(p.summary, locale)!,
      content: pick(p.content, locale)!,
      status: p.status,
      stack: p.stack,
      repo: p.repo,
      links: p.links,
      featured: p.featured,
      order: p.order,
      hero: p.hero,
      available: locales.filter((l) => projectHasPage(p, l)),
    }))
    .sort((a, b) => a.order - b.order);
}

export function getPage(slug: string, locale: Locale): { title: string; content: LexicalRoot; available: Locale[] } | undefined {
  const page = many<Page>('pages').find((p) => p.slug === slug && p._status === 'published');
  if (!page) return undefined;
  const has = (l: Locale) => Boolean(pick(page.title, l)) && hasContent(pick(page.content, l));
  if (!has(locale)) return undefined;
  return { title: pick(page.title, locale)!, content: pick(page.content, locale)!, available: locales.filter(has) };
}

/** Every published standalone page that exists in `locale`. */
export function getAllPages(locale: Locale): { slug: string; title: string; content: LexicalRoot }[] {
  return many<Page>('pages')
    .filter((p) => p._status === 'published' && Boolean(pick(p.title, locale)) && hasContent(pick(p.content, locale)))
    .map((p) => ({ slug: p.slug, title: pick(p.title, locale)!, content: pick(p.content, locale)! }));
}

/** Tags that have at least one post page in `locale`. */
export function getUsedTags(locale: Locale): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const post of getPosts(locale))
    for (const tag of post.tags) counts.set(tag.slug, { name: tag.name, count: (counts.get(tag.slug)?.count ?? 0) + 1 });
  return [...counts].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

export type CategoryRoute = 'tech' | 'finance' | 'japan';
/** Route slug for each category: /tech/, /finance/ and /japan/. */
export const categoryRoute: Record<Category['slug'], CategoryRoute> = { tech: 'tech', finance: 'finance', 'japan-life': 'japan' };
export const categoryByRoute: Record<CategoryRoute, Category['slug']> = { tech: 'tech', finance: 'finance', japan: 'japan-life' };

/** Posts that share the most tags (then the same category) with `post`, newest first on ties. */
export function getRelated(post: PostView, locale: Locale, count = 2): PostView[] {
  return getPosts(locale)
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      p,
      score: p.tags.filter((t) => post.tags.some((x) => x.slug === t.slug)).length * 2 + (p.category.slug === post.category.slug ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.pubDate.localeCompare(a.p.pubDate))
    .slice(0, count)
    .map((x) => x.p);
}

/** Uses groups as written in `locale`: groups and items without a name in this locale are left out, with no fallback. */
export function getUsesGroups(locale: Locale) {
  return getUses()
    .groups.map((g) => ({
      title: pick(g.title, locale),
      items: g.items.map((i) => ({ id: i.id, name: pick(i.name, locale), note: pick(i.note, locale) })).filter((i) => i.name),
    }))
    .filter((g) => g.title && g.items.length > 0) as { title: string; items: { id: string; name: string; note?: string }[] }[];
}

const hasNow = (locale: Locale) => hasContent(pick(getNow().content, locale));

/** Locales in which the single-page sections exist. Navigation and `getStaticPaths` both use this, so a link never points at nothing. */
export const sectionLocales = {
  uses: () => locales.filter((l) => getUsesGroups(l).length > 0),
  now: () => locales.filter(hasNow),
  about: () => locales.filter((l) => getPage('about', l)),
  resume: (): Locale[] => ['en'],
};

/** Does the nav key (`uses`, `now`, `about`, `resume`) have a page in `locale`? Other keys always exist. */
export function navPageExists(key: string, locale: Locale): boolean {
  const resolver = (sectionLocales as Record<string, () => Locale[]>)[key];
  return resolver ? resolver().includes(locale) : true;
}
