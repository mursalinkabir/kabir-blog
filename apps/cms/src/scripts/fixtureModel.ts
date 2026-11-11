/**
 * How the site's sample content (apps/site/src/content/fixtures) becomes CMS documents. Shared by the local seed (Local
 * API) and the importer that moves the same content into a running CMS over REST, so there is one definition of the
 * mapping. Nothing here touches a database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export type Localized<T> = Partial<Record<Locale, T>>;
export type Json = Record<string, any>; // fixture JSON is untyped on purpose
export type Ids = Map<string, number | string>;

const here = path.dirname(fileURLToPath(import.meta.url));
export const cmsRoot = path.resolve(here, '../..');
export const siteRoot = path.resolve(cmsRoot, '../site');
export const fixturesDir = path.join(siteRoot, 'src/content/fixtures');

const readJson = async (rel: string): Promise<Json> => JSON.parse(await fs.readFile(path.join(fixturesDir, rel), 'utf8'));
const readDir = async (rel: string): Promise<Json[]> => {
  const names = (await fs.readdir(path.join(fixturesDir, rel))).filter((n) => n.endsWith('.json')).sort();
  return Promise.all(names.map((n) => readJson(path.join(rel, n))));
};

export interface Fixtures {
  posts: Json[];
  projects: Json[];
  pages: Json[];
  site: Json;
  now: Json;
  uses: Json;
  resume: Json;
}

export async function loadFixtures(): Promise<Fixtures> {
  const [posts, projects, pages] = await Promise.all([readDir('posts'), readDir('projects'), readDir('pages')]);
  const [site, now, uses, resume] = await Promise.all(['site', 'now', 'uses', 'resume'].map((n) => readJson(`${n}.json`)));
  return { posts, projects, pages, site, now, uses, resume };
}

const hasValue = (v: unknown): boolean => {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

/** Locales in which at least one of the localized fields has a value, default locale first. */
export function activeLocales(perLocale: Record<Locale, Json>): Locale[] {
  const active = LOCALES.filter((l) => Object.values(perLocale[l]).some(hasValue));
  return active.length ? active : ['en'];
}

/** Build `{ en: ..., ja: ... }` by calling `fn` once per locale. */
export const byLocale = (fn: (l: Locale) => Json): Record<Locale, Json> => ({ en: fn('en'), ja: fn('ja') });

const pickLocale = <T>(value: Localized<T> | undefined, locale: Locale): T | undefined => value?.[locale];

// ---------------------------------------------------------------- media

/** Each distinct image the content refers to, by fixture id. */
export function collectMedia(fx: Fixtures): Map<string, Json> {
  const found = new Map<string, Json>();
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const o = n as Json;
    if (typeof o.id === 'string' && typeof o.url === 'string' && o.alt) found.set(o.id, o);
    Object.values(o).forEach(visit);
  };
  visit([fx.posts, fx.projects, fx.pages]);
  return found;
}

/** The file for one media fixture. Placeholder illustrations are SVG, which the CMS refuses on purpose: rasterise them. */
export async function mediaFile(m: Json): Promise<{ buffer: Buffer; name: string; mimetype: string }> {
  const src = path.join(siteRoot, 'public', String(m.url).replace(/^\//, ''));
  let buffer = await fs.readFile(src);
  let name = path.basename(src);
  let mimetype = String(m.mimeType);
  if (mimetype === 'image/svg+xml') {
    buffer = await sharp(buffer).webp({ quality: 90 }).toBuffer();
    name = name.replace(/\.svg$/, '.webp');
    mimetype = 'image/webp';
  }
  return { buffer, name, mimetype };
}

// ---------------------------------------------------------------- rich text

/** Walk a Lexical tree and swap the fixtures' embedded media objects for the ids the CMS stores. */
export function remapMedia(node: unknown, ids: Ids): unknown {
  if (Array.isArray(node)) return node.map((n) => remapMedia(n, ids));
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) out[k] = remapMedia(v, ids);
  const f = out.fields as Json | undefined;
  if (out.type === 'block' && f?.blockType === 'figure' && f.media?.id) f.media = ids.get(f.media.id);
  if (out.type === 'block' && f?.blockType === 'gallery-strip') {
    f.media = (f.media as Json[]).map((m) => ids.get(m.id)).filter((v) => v != null);
  }
  return out;
}

const lexicalFor = (field: Localized<unknown> | undefined, locale: Locale, ids: Ids) => {
  const value = pickLocale(field, locale);
  return value ? remapMedia(value, ids) : undefined;
};

// ---------------------------------------------------------------- documents

export interface DocPlan {
  slug: string;
  draft: boolean;
  base: Json;
  perLocale: Record<Locale, Json>;
}

/** Categories and tags are embedded in the posts; this lists each once. */
export function taxonomy(fx: Fixtures): { categories: DocPlan[]; tags: DocPlan[] } {
  const categories = new Map<string, Json>();
  const tags = new Map<string, Json>();
  for (const p of fx.posts) {
    categories.set(p.category.slug, p.category);
    for (const t of p.tags ?? []) tags.set(t.slug, t);
  }
  const plan = (m: Map<string, Json>): DocPlan[] =>
    [...m].map(([slug, x]) => ({ slug, draft: false, base: { slug }, perLocale: { en: { name: x.name.en }, ja: { name: x.name.ja } } }));
  return { categories: plan(categories), tags: plan(tags) };
}

export interface Refs {
  media: Ids;
  categories: Ids;
  tags: Ids;
}

export function postPlans(fx: Fixtures, refs: Refs): DocPlan[] {
  return fx.posts.map((p) => {
    const draft = p._status === 'draft';
    return {
      slug: p.slug,
      draft,
      base: {
        slug: p.slug,
        category: refs.categories.get(p.category.slug),
        tags: (p.tags ?? []).map((t: Json) => refs.tags.get(t.slug)),
        pubDate: p.pubDate,
        updatedDate: p.updatedDate,
        hero: p.hero ? refs.media.get(p.hero.id) : undefined,
        series: p.series,
        toc: p.toc,
        _status: draft ? 'draft' : 'published',
      },
      perLocale: byLocale((l) => ({
        title: pickLocale(p.title, l),
        description: pickLocale(p.description, l),
        publishedIn: Boolean(p.publishedIn?.[l]),
        content: lexicalFor(p.content, l, refs.media),
      })),
    };
  });
}

export function projectPlans(fx: Fixtures, refs: Refs): DocPlan[] {
  return fx.projects.map((p) => {
    const draft = p._status === 'draft';
    return {
      slug: p.slug,
      draft,
      base: {
        slug: p.slug,
        status: p.status,
        stack: (p.stack ?? []).map((label: string) => ({ label })),
        repo: p.repo,
        links: p.links ?? [],
        featured: p.featured,
        order: p.order,
        hero: p.hero ? refs.media.get(p.hero.id) : undefined,
        _status: draft ? 'draft' : 'published',
      },
      perLocale: byLocale((l) => ({
        title: pickLocale(p.title, l),
        summary: pickLocale(p.summary, l),
        content: lexicalFor(p.content, l, refs.media),
      })),
    };
  });
}

export function pagePlans(fx: Fixtures, refs: Refs): DocPlan[] {
  return fx.pages.map((p) => {
    const draft = p._status === 'draft';
    return {
      slug: p.slug,
      draft,
      base: { slug: p.slug, _status: draft ? 'draft' : 'published' },
      perLocale: byLocale((l) => ({ title: pickLocale(p.title, l), content: lexicalFor(p.content, l, refs.media) })),
    };
  });
}

export interface GlobalPlan {
  slug: 'site' | 'now' | 'uses' | 'resume';
  /** Writes in order: the first carries the non-localized fields. */
  writes: { locale: Locale; data: Json }[];
}

/** The four site-wide settings. Uses rows keep the fixture ids so the second language lines up with the first. */
export function globalPlans(fx: Fixtures, media: Ids): GlobalPlan[] {
  const { site, now, uses, resume } = fx;
  const first = (slug: GlobalPlan['slug'], base: Json, perLocale?: Record<Locale, Json>): GlobalPlan => {
    const locales = perLocale ? activeLocales(perLocale) : (['en'] as Locale[]);
    return { slug, writes: locales.map((locale, i) => ({ locale, data: { ...(i === 0 ? base : {}), ...(perLocale?.[locale] ?? {}) } })) };
  };
  const usesRows = (l: Locale) =>
    (uses.groups as Json[]).map((g) => ({
      id: g.id,
      title: pickLocale(g.title, l),
      items: (g.items as Json[]).map((it) => ({ id: it.id, name: pickLocale(it.name, l), note: pickLocale(it.note, l) })),
    }));
  return [
    first(
      'site',
      { email: site.email, socials: site.socials, nav: site.nav, navMore: site.navMore },
      byLocale((l) => ({ name: pickLocale(site.name, l), tagline: pickLocale(site.tagline, l) })),
    ),
    first(
      'now',
      {},
      byLocale((l) => ({ content: lexicalFor(now.content, l, media) })),
    ),
    {
      slug: 'uses',
      writes: [
        { locale: 'en', data: { groups: usesRows('en') } },
        { locale: 'ja', data: { groups: usesRows('ja') } },
      ],
    },
    first('resume', {
      basics: resume.basics,
      work: resume.work.map((w: Json) => ({ ...w, highlights: (w.highlights ?? []).map((text: string) => ({ text })) })),
      education: resume.education,
      skills: resume.skills.map((s: Json) => ({ ...s, keywords: (s.keywords ?? []).map((text: string) => ({ text })) })),
      projects: resume.projects,
      languages: resume.languages,
      certificates: resume.certificates,
    }),
  ];
}
