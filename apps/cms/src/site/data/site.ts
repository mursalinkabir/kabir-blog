// The site as a view over one snapshot of content. Everything the pages ask ("which posts exist in this locale?") is
// answered here from plain data, so tests and the parity run need no database. Content comes in as `SiteData`
// (see data/map.ts for how Payload documents become that, and data/fixtures.ts for the committed sample).
import { defaultLocale, locales, type Locale } from '../i18n';
import type { Category, Localized, Media, NowGlobal, Page, Post, Project, ResumeGlobal, SiteGlobal, UsesGlobal } from '../lib/types';
import type { LexicalRoot } from '../lib/lexical/types';
import { headings, isEmptyDoc, readingMinutes, type Heading } from '../lib/lexical/walk';
import { collectEmbeds, type FoundEmbed } from '../lib/embeds';

export interface SiteData {
  posts: Post[];
  projects: Project[];
  pages: Page[];
  site: SiteGlobal;
  now: NowGlobal;
  uses: UsesGlobal;
  resume: ResumeGlobal;
}

export interface SiteOptions {
  source: 'cms' | 'fixtures';
  /** Changes when the content changes; used for ETags and /version.json. */
  version: string;
  /** Preview mode ignores the draft/published status only. Every other rule still applies. */
  preview?: boolean;
}

/** Localized field lookup. There is deliberately no fallback to another locale. */
export const pick = <T>(field: Localized<T> | undefined, locale: Locale): T | undefined => {
  const v = field?.[locale];
  return v === '' || v === null ? undefined : v;
};

/** A localized rich-text value counts as present only when it has something in it (an untouched editor does not). */
const hasContent = (doc: LexicalRoot | undefined): boolean => Boolean(doc) && !isEmptyDoc(doc!);

/** What stops a post from having a page in `locale`. Empty means it has one. */
export function postBlockers(post: Post, locale: Locale, preview = false): string[] {
  const out: string[] = [];
  if (!preview && post._status !== 'published') out.push('status');
  if (post.publishedIn[locale] !== true) out.push('publishedIn');
  if (!pick(post.title, locale)) out.push('title');
  if (!pick(post.description, locale)) out.push('description');
  if (!hasContent(pick(post.content, locale))) out.push('content');
  if (post.hero && !pick(post.hero.alt, locale)) out.push('heroAlt');
  if (!pick(post.category.name, locale)) out.push('category');
  return out;
}

/**
 * Published, visible in `locale`, and every required localized field present: title, description, non-empty content
 * and, when the post has a cover, that cover's alt text in this locale. Otherwise: no page, never another language.
 */
export function hasPage(post: Post, locale: Locale, preview = false): boolean {
  return postBlockers(post, locale, preview).length === 0;
}

export type CategoryRoute = 'tech' | 'finance' | 'japan';
/** Route slug for each category: /tech/, /finance/ and /japan/. */
export const categoryRoute: Record<Category['slug'], CategoryRoute> = { tech: 'tech', finance: 'finance', 'japan-life': 'japan' };
export const categoryByRoute: Record<CategoryRoute, Category['slug']> = { tech: 'tech', finance: 'finance', japan: 'japan-life' };

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

export interface PageView {
  slug: string;
  title: string;
  content: LexicalRoot;
  available: Locale[];
}

export function createSite(data: SiteData, opts: SiteOptions) {
  const preview = opts.preview === true;
  const postViews = new Map<Locale, PostView[]>();
  let embedMap: Map<string, FoundEmbed> | undefined;

  const visible = (status: string) => preview || status === 'published';
  const postHas = (p: Post, l: Locale) => hasPage(p, l, preview);

  function buildPosts(locale: Locale): PostView[] {
    return data.posts
      .filter((p) => postHas(p, locale))
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
          category: { slug: p.category.slug, name: pick(p.category.name, locale)! },
          tags: p.tags.flatMap((t) => {
            const name = pick(t.name, locale);
            return name ? [{ slug: t.slug, name }] : [];
          }),
          hero: p.hero,
          series: p.series,
          toc: p.toc,
          available: locales.filter((l) => postHas(p, l)),
        } satisfies PostView;
      })
      .sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  }

  const projectHas = (p: Project, l: Locale) =>
    visible(p._status) && Boolean(pick(p.title, l)) && Boolean(pick(p.summary, l)) && hasContent(pick(p.content, l));
  const pageHas = (p: Page, l: Locale) => visible(p._status) && Boolean(pick(p.title, l)) && hasContent(pick(p.content, l));

  const getPosts = (locale: Locale): PostView[] => {
    const cached = postViews.get(locale);
    if (cached) return cached;
    const views = buildPosts(locale);
    postViews.set(locale, views);
    return views;
  };

  const getUsesGroups = (locale: Locale) =>
    data.uses.groups
      .map((g) => ({
        title: pick(g.title, locale),
        items: g.items.map((i) => ({ id: i.id, name: pick(i.name, locale), note: pick(i.note, locale) })).filter((i) => i.name),
      }))
      .filter((g) => g.title && g.items.length > 0) as { title: string; items: { id: string; name: string; note?: string }[] }[];

  const getPage = (slug: string, locale: Locale): PageView | undefined => {
    const page = data.pages.find((p) => p.slug === slug);
    if (!page || !pageHas(page, locale)) return undefined;
    return {
      slug,
      title: pick(page.title, locale)!,
      content: pick(page.content, locale)!,
      available: locales.filter((l) => pageHas(page, l)),
    };
  };

  const site = {
    source: opts.source,
    version: opts.version,
    preview,
    getSite: () => data.site,
    getNow: () => data.now,
    getResume: () => data.resume,
    siteName: (locale: Locale) => pick(data.site.name, locale) ?? pick(data.site.name, defaultLocale) ?? 'smkabir.com',
    getPosts,
    getProjects: (locale: Locale): ProjectView[] =>
      data.projects
        .filter((p) => projectHas(p, locale))
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
          available: locales.filter((l) => projectHas(p, l)),
        }))
        .sort((a, b) => a.order - b.order),
    getPage,
    /** Every standalone page that exists in `locale`. */
    getAllPages: (locale: Locale): Omit<PageView, 'available'>[] =>
      data.pages
        .filter((p) => pageHas(p, locale))
        .map((p) => ({ slug: p.slug, title: pick(p.title, locale)!, content: pick(p.content, locale)! })),
    /** Tags that have at least one post page in `locale`. */
    getUsedTags: (locale: Locale): { slug: string; name: string; count: number }[] => {
      const counts = new Map<string, { name: string; count: number }>();
      for (const post of getPosts(locale))
        for (const tag of post.tags) counts.set(tag.slug, { name: tag.name, count: (counts.get(tag.slug)?.count ?? 0) + 1 });
      return [...counts].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
    },
    /** Posts that share the most tags (then the same category) with `post`, newest first on ties. */
    getRelated: (post: PostView, locale: Locale, count = 2): PostView[] =>
      getPosts(locale)
        .filter((p) => p.slug !== post.slug)
        .map((p) => ({
          p,
          score:
            p.tags.filter((t) => post.tags.some((x) => x.slug === t.slug)).length * 2 + (p.category.slug === post.category.slug ? 1 : 0),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.p.pubDate.localeCompare(a.p.pubDate))
        .slice(0, count)
        .map((x) => x.p),
    /** Uses groups as written in `locale`: groups and items without a name in this locale are left out, with no fallback. */
    getUsesGroups,
    /** Locales in which the single-page sections exist. Navigation and the router both use this, so a link never points at nothing. */
    sectionLocales: {
      uses: (): Locale[] => locales.filter((l) => getUsesGroups(l).length > 0),
      now: (): Locale[] => locales.filter((l) => hasContent(pick(data.now.content, l))),
      about: (): Locale[] => locales.filter((l) => getPage('about', l)),
      resume: (): Locale[] => ['en'],
    },
    /** Does the nav key (`uses`, `now`, `about`, `resume`) have a page in `locale`? Other keys always exist. */
    navPageExists: (key: string, locale: Locale): boolean => {
      const resolver = (site.sectionLocales as Record<string, () => Locale[]>)[key];
      return resolver ? resolver().includes(locale) : true;
    },
    /** Why `post` has no page in `locale`; empty means it has one. */
    pageBlockers: (post: Post, locale: Locale): string[] => postBlockers(post, locale, preview),
    /** The same by slug; `['missing']` when no post has that slug. */
    pageBlockersFor: (slug: string, locale: Locale): string[] => {
      const post = data.posts.find((p) => p.slug === slug);
      return post ? postBlockers(post, locale, preview) : ['missing'];
    },
    /** The HTML embeds of everything the site renders, by id. */
    embeds: (): Map<string, FoundEmbed> => (embedMap ??= new Map(collectEmbeds(site).map((e) => [e.id, e]))),
  };
  return site;
}

export type Site = ReturnType<typeof createSite>;
