// Maps Payload documents (Local API, `locale: 'all'`, depth 0) to the shapes lib/types.ts describes, which are also the
// shapes of the fixtures. Pure: no database, no disk. Ported from apps/site/scripts/lib/cms-map.mjs; differences:
//   - one document that fails to map is skipped and reported in `errors`, never the whole site;
//   - media URLs are the URLs Payload returns (local API route or R2 public URL), not /media/<filename>.
// Rules this file enforces so the rest of the site does not have to:
//   - null, "" and an untouched editor all mean "not written in that locale": the key is dropped, never filled from another language;
//   - relationships arrive as ids and are resolved from the collections loaded alongside;
//   - media inside rich-text blocks is replaced by the full media object, with alt text in every locale.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SiteData } from './site';
import type { RawContent } from './load';

const LOCALES = ['en', 'ja'];
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

type Json = Record<string, any>;

const isObject = (v: any): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Payload sends `{ en: ..., ja: ... }` for a localized field; absent or null locales are dropped. */
export function localized(value: any, { keepEmptyString = false } = {}): Json | undefined {
  if (!isObject(value)) return undefined;
  const out: Json = {};
  for (const l of LOCALES) {
    const v = value[l];
    if (v === null || v === undefined) continue;
    if (v === '' && !keepEmptyString) continue;
    out[l] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** True when a Lexical document has nothing in it: only empty paragraphs. Blocks always count as content. */
export function isEmptyLexical(doc: any): boolean {
  const children = doc?.root?.children;
  if (!Array.isArray(children) || children.length === 0) return true;
  const textOf = (n: any): string =>
    n.type === 'text' ? String(n.text ?? '') : Array.isArray(n.children) ? n.children.map(textOf).join('') : '';
  return children.every((n: any) => n.type === 'paragraph' && textOf(n).trim() === '');
}

function localizedRichText(value: any) {
  if (!isObject(value)) return undefined;
  const out: Json = {};
  for (const l of LOCALES) if (value[l] && !isEmptyLexical(value[l])) out[l] = value[l];
  return Object.keys(out).length ? out : undefined;
}

const idOf = (ref: any) => (isObject(ref) ? ref.id : ref);
const key = (id: any) => String(id);

// ---------------------------------------------------------------- media

/** One media document. The URLs are the ones Payload returns for the file and for each generated size. */
export function mapMedia(doc: Json): Json {
  if (doc.filename && !FILENAME.test(doc.filename)) throw new Error(`media ${doc.id}: unsafe filename "${doc.filename}"`);
  const sizes: Json = {};
  for (const [name, s] of Object.entries<any>(doc.sizes ?? {})) {
    if (!s?.url || !s.filename) continue;
    if (!FILENAME.test(s.filename)) throw new Error(`media ${doc.id}: unsafe size filename "${s.filename}"`);
    const width = Number(name.replace(/^w/, '')) || s.width;
    sizes[String(width)] = { url: s.url, width: s.width, height: s.height };
  }
  const hasSizes = Object.keys(sizes).length > 0;
  let url: string;
  if (hasSizes) {
    // The site never prints the original when sizes exist; keep `url` pointing at the largest generated size.
    url = (Object.values(sizes) as Json[]).sort((a, b) => b.width - a.width)[0]!.url;
  } else {
    if (!doc.filename || !doc.url) throw new Error(`media ${doc.id}: no url and no sizes`);
    url = doc.url;
  }
  return {
    id: key(doc.id),
    url,
    filename: doc.filename,
    mimeType: doc.mimeType,
    width: doc.width,
    height: doc.height,
    alt: localized(doc.alt) ?? {},
    ...(localized(doc.caption) ? { caption: localized(doc.caption) } : {}),
    ...(doc.credit ? { credit: doc.credit } : {}),
    ...(hasSizes ? { sizes } : {}),
  };
}

// ---------------------------------------------------------------- context

type Ctx = { media: Map<string, Json>; categories: Map<string, Json>; tags: Map<string, Json> };

/** Builds the lookups for relationships. A media document that cannot be mapped is left out (and reported). */
export function createContext(raw: RawContent, errors: string[] = []): Ctx {
  const media = new Map<string, Json>();
  for (const doc of raw.media as Json[]) {
    try {
      const mapped = mapMedia(doc);
      media.set(key(doc.id), mapped);
      // Production keeps media on R2 (MEDIA_PUBLIC_URL). A URL under /api/ is hidden on the public hostname: report it.
      if (process.env.NODE_ENV === 'production' && String(mapped.url).startsWith('/api/'))
        errors.push(`media/${doc.id}: URL is not public`);
    } catch (e) {
      errors.push(`media/${doc.id}: ${(e as Error).message}`);
    }
  }
  const categories = new Map<string, Json>();
  for (const c of raw.categories as Json[]) categories.set(key(c.id), { id: key(c.id), slug: c.slug, name: localized(c.name) ?? {} });
  const tags = new Map<string, Json>();
  for (const t of raw.tags as Json[]) tags.set(key(t.id), { id: key(t.id), slug: t.slug, name: localized(t.name) ?? {} });
  return { media, categories, tags };
}

function resolveMedia(ctx: Ctx, ref: any, where: string, published: boolean): Json | undefined {
  const id = idOf(ref);
  if (id === null || id === undefined) return undefined;
  const hit = ctx.media.get(key(id));
  if (!hit) {
    if (published) throw new Error(`${where}: media ${id} does not exist`);
    return undefined;
  }
  return hit;
}

/** Replace `media` references inside rich-text blocks with media objects. Does not mutate the input. */
function remapBlocks(ctx: Ctx, node: any, where: string, published: boolean): any {
  if (Array.isArray(node)) return node.map((n: any) => remapBlocks(ctx, n, where, published));
  if (!isObject(node)) return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node)) out[k] = remapBlocks(ctx, v, where, published);
  if (out.type === 'block' && isObject(out.fields)) {
    if (out.fields.blockType === 'figure') {
      out.fields.media = resolveMedia(ctx, node.fields.media, `${where} (figure)`, published);
    }
    if (out.fields.blockType === 'gallery-strip') {
      const list = Array.isArray(node.fields.media) ? node.fields.media : [];
      out.fields.media = list.map((m: any) => resolveMedia(ctx, m, `${where} (photo strip)`, published)).filter(Boolean);
    }
  }
  return out;
}

function mapContent(ctx: Ctx, value: any, where: string, published: boolean): Json {
  const rich = localizedRichText(value);
  if (!rich) return {};
  return Object.fromEntries(Object.entries(rich).map(([l, doc]) => [l, remapBlocks(ctx, doc, `${where} [${l}]`, published)]));
}

const statusOf = (doc: Json) => (doc._status === 'published' ? 'published' : 'draft');

// ---------------------------------------------------------------- collections

export function mapPost(ctx: Ctx, doc: Json): Json {
  const status = statusOf(doc);
  const published = status === 'published';
  const where = `post "${doc.slug}"`;
  const category = ctx.categories.get(key(idOf(doc.category)));
  if (!category) throw new Error(`${where}: category ${idOf(doc.category)} does not exist`);
  const tags = (doc.tags ?? []).map((t: any) => ctx.tags.get(key(idOf(t)))).filter(Boolean);
  const hero = resolveMedia(ctx, doc.hero, `${where} cover`, published);
  const series = doc.series?.name && doc.series?.part ? { name: doc.series.name, part: doc.series.part } : undefined;
  return {
    id: key(doc.id),
    _status: status,
    slug: doc.slug,
    pubDate: doc.pubDate,
    ...(doc.updatedDate ? { updatedDate: doc.updatedDate } : {}),
    category,
    tags,
    ...(hero ? { hero } : {}),
    ...(series ? { series } : {}),
    toc: doc.toc !== false,
    publishedIn: Object.fromEntries(LOCALES.map((l: any) => [l, doc.publishedIn?.[l] === true])),
    title: localized(doc.title) ?? {},
    description: localized(doc.description) ?? {},
    content: mapContent(ctx, doc.content, where, published),
  };
}

export function mapProject(ctx: Ctx, doc: Json): Json {
  const status = statusOf(doc);
  const published = status === 'published';
  const where = `project "${doc.slug}"`;
  const hero = resolveMedia(ctx, doc.hero, `${where} cover`, published);
  return {
    id: key(doc.id),
    _status: status,
    slug: doc.slug,
    status: doc.status,
    stack: (doc.stack ?? []).map((s: any) => s.label).filter(Boolean),
    ...(doc.repo ? { repo: doc.repo } : {}),
    links: (doc.links ?? []).map((l: any) => ({ label: l.label, url: l.url })),
    featured: doc.featured === true,
    order: typeof doc.order === 'number' ? doc.order : 100,
    ...(hero ? { hero } : {}),
    title: localized(doc.title) ?? {},
    summary: localized(doc.summary) ?? {},
    content: mapContent(ctx, doc.content, where, published),
  };
}

export function mapPage(ctx: Ctx, doc: Json): Json {
  const status = statusOf(doc);
  const where = `page "${doc.slug}"`;
  return {
    id: key(doc.id),
    _status: status,
    slug: doc.slug,
    title: localized(doc.title) ?? {},
    content: mapContent(ctx, doc.content, where, status === 'published'),
  };
}

// ---------------------------------------------------------------- globals

export function mapSite(g: Json): Json {
  return {
    name: localized(g.name) ?? {},
    tagline: localized(g.tagline) ?? {},
    email: g.email,
    socials: (g.socials ?? []).map((s: any) => ({ label: s.label, url: s.url })),
    nav: g.nav ?? [],
    navMore: g.navMore ?? [],
  };
}

export function mapNow(ctx: Ctx, g: Json): Json {
  return { updatedAt: g.updatedAt, content: mapContent(ctx, g.content, 'now', true) };
}

export function mapUses(g: Json): Json {
  return {
    groups: (g.groups ?? []).map((group: any) => ({
      id: key(group.id),
      title: localized(group.title) ?? {},
      items: (group.items ?? []).map((it: any) => ({
        id: key(it.id),
        name: localized(it.name) ?? {},
        ...(localized(it.note) ? { note: localized(it.note) } : {}),
      })),
    })),
  };
}

export function mapResume(g: Json): Json {
  const dropEmpty = (o: Json) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const b = g.basics ?? {};
  return {
    updatedAt: g.updatedAt,
    basics: {
      name: b.name,
      label: b.label,
      email: b.email,
      url: b.url ?? '',
      summary: b.summary ?? '',
      profiles: (b.profiles ?? []).map((p: any) => ({ network: p.network, url: p.url })),
    },
    work: (g.work ?? []).map((w: any) =>
      dropEmpty({
        id: key(w.id),
        name: w.name,
        position: w.position,
        startDate: w.startDate,
        endDate: w.endDate,
        highlights: (w.highlights ?? []).map((h: any) => h.text),
      }),
    ),
    education: (g.education ?? []).map((e: any) =>
      dropEmpty({
        id: key(e.id),
        institution: e.institution,
        area: e.area,
        studyType: e.studyType,
        startDate: e.startDate,
        endDate: e.endDate,
      }),
    ),
    skills: (g.skills ?? []).map((s: any) => ({ id: key(s.id), name: s.name, keywords: (s.keywords ?? []).map((k: any) => k.text) })),
    projects: (g.projects ?? []).map((p: any) => dropEmpty({ id: key(p.id), name: p.name, description: p.description, url: p.url })),
    languages: (g.languages ?? []).map((l: any) => ({ id: key(l.id), language: l.language, spoken: l.spoken, reading: l.reading })),
    certificates: (g.certificates ?? []).map((c: any) => ({ id: key(c.id), name: c.name, issuer: c.issuer, date: c.date })),
  };
}

// ---------------------------------------------------------------- everything

/** An empty global, used when mapping one fails, so the site keeps working without it. */
const EMPTY: Record<string, Json> = {
  site: { name: {}, tagline: {}, email: '', socials: [], nav: [], navMore: [] },
  now: { updatedAt: '', content: {} },
  uses: { groups: [] },
  resume: {
    updatedAt: '',
    basics: { name: '', label: '', email: '', url: '', summary: '', profiles: [] },
    work: [],
    education: [],
    skills: [],
    projects: [],
    languages: [],
    certificates: [],
  },
};

/**
 * Maps everything. A document that fails to map is skipped and reported as `"<collection>/<slug or id>: <message>"`;
 * the first of two posts with the same slug wins.
 */
export function mapAll(raw: RawContent): { data: SiteData; errors: string[] } {
  const errors: string[] = [];
  const ctx = createContext(raw, errors);
  const each = (collection: string, docs: unknown[], fn: (c: Ctx, d: Json) => Json): Json[] => {
    const out: Json[] = [];
    for (const doc of docs as Json[]) {
      try {
        out.push(fn(ctx, doc));
      } catch (e) {
        errors.push(`${collection}/${doc.slug ?? doc.id}: ${(e as Error).message}`);
      }
    }
    return out;
  };
  const slugs = new Set<string>();
  const posts = each('posts', raw.posts, mapPost).filter((p) => {
    if (slugs.has(p.slug)) {
      errors.push(`posts/${p.slug}: duplicate slug`);
      return false;
    }
    slugs.add(p.slug);
    return true;
  });
  const one = (name: string, fn: () => Json): Json => {
    try {
      return fn();
    } catch (e) {
      errors.push(`globals/${name}: ${(e as Error).message}`);
      return EMPTY[name]!;
    }
  };
  const g = raw.globals as Record<string, Json>;
  const data = {
    posts,
    projects: each('projects', raw.projects, mapProject),
    pages: each('pages', raw.pages, mapPage),
    site: one('site', () => mapSite(g.site!)),
    now: one('now', () => mapNow(ctx, g.now!)),
    uses: one('uses', () => mapUses(g.uses!)),
    resume: one('resume', () => mapResume(g.resume!)),
  } as unknown as SiteData;
  return { data, errors };
}
