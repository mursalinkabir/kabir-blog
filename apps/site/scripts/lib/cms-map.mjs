// Maps raw Payload REST responses (`?locale=all&fallback-locale=none&depth=0`) to the shapes apps/site/src/lib/types.ts
// describes, which are also the shapes of the fixtures. Pure functions: no network, no disk. The pull script
// (scripts/pull-cms.mjs) does the I/O; tests/cms-map.test.ts runs this against a captured real response.
//
// Rules this file enforces so the rest of the site does not have to:
//   - null, "" and an untouched editor all mean "not written in that locale": the key is dropped, never filled
//     from another language;
//   - relationships arrive as ids (depth=0) and are resolved from the collections fetched alongside;
//   - media inside rich-text blocks is replaced by the full media object, with alt text in every locale;
//   - a published document that points at something missing is an error, not a silent gap.

const LOCALES = ['en', 'ja'];
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/** @typedef {Record<string, any>} Json */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Payload sends `{ en: ..., ja: ... }` for a localized field; absent or null locales are dropped. */
export function localized(value, { keepEmptyString = false } = {}) {
  if (!isObject(value)) return undefined;
  const out = {};
  for (const l of LOCALES) {
    const v = value[l];
    if (v === null || v === undefined) continue;
    if (v === '' && !keepEmptyString) continue;
    out[l] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** True when a Lexical document has nothing in it: only empty paragraphs. Blocks always count as content. */
export function isEmptyLexical(doc) {
  const children = doc?.root?.children;
  if (!Array.isArray(children) || children.length === 0) return true;
  const textOf = (n) => (n.type === 'text' ? String(n.text ?? '') : Array.isArray(n.children) ? n.children.map(textOf).join('') : '');
  return children.every((n) => n.type === 'paragraph' && textOf(n).trim() === '');
}

function localizedRichText(value) {
  if (!isObject(value)) return undefined;
  const out = {};
  for (const l of LOCALES) if (value[l] && !isEmptyLexical(value[l])) out[l] = value[l];
  return Object.keys(out).length ? out : undefined;
}

const idOf = (ref) => (isObject(ref) ? ref.id : ref);
const key = (id) => String(id);

// ---------------------------------------------------------------- media

/**
 * One media document. `file` records which files the pull has to download and what they are called on the site:
 * the generated sizes (the only URLs the site prints), plus the original when there are no sizes (an image smaller
 * than the smallest size is never resized).
 */
export function mapMedia(doc) {
  if (doc.filename && !FILENAME.test(doc.filename)) throw new Error(`media ${doc.id}: unsafe filename "${doc.filename}"`);
  const downloads = [];
  const sizes = {};
  for (const [name, s] of Object.entries(doc.sizes ?? {})) {
    if (!s?.url || !s.filename) continue;
    if (!FILENAME.test(s.filename)) throw new Error(`media ${doc.id}: unsafe size filename "${s.filename}"`);
    const width = Number(name.replace(/^w/, '')) || s.width;
    sizes[String(width)] = { url: `/media/${s.filename}`, width: s.width, height: s.height };
    downloads.push({ from: s.url, name: s.filename });
  }
  const hasSizes = Object.keys(sizes).length > 0;
  let url;
  if (hasSizes) {
    // The site never prints the original when sizes exist; keep `url` pointing at something that is published.
    const largest = Object.values(sizes).sort((a, b) => b.width - a.width)[0];
    url = largest.url;
  } else {
    if (!doc.filename) throw new Error(`media ${doc.id}: no filename and no sizes`);
    url = `/media/${doc.filename}`;
    downloads.push({ from: doc.url, name: doc.filename });
  }
  const media = {
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
  return { media, downloads };
}

// ---------------------------------------------------------------- context

/**
 * Builds lookups for the relationships and records which media a published document uses.
 * `used` is a Map of media id -> download list, filled only while mapping published documents.
 */
export function createContext(raw) {
  const media = new Map();
  for (const doc of raw.media ?? []) media.set(key(doc.id), mapMedia(doc));
  const categories = new Map();
  for (const c of raw.categories ?? []) {
    categories.set(key(c.id), { id: key(c.id), slug: c.slug, name: localized(c.name) ?? {} });
  }
  const tags = new Map();
  for (const t of raw.tags ?? []) tags.set(key(t.id), { id: key(t.id), slug: t.slug, name: localized(t.name) ?? {} });
  return { media, categories, tags, used: new Map() };
}

function resolveMedia(ctx, ref, where, published) {
  const id = idOf(ref);
  if (id === null || id === undefined) return undefined;
  const hit = ctx.media.get(key(id));
  if (!hit) {
    if (published) throw new Error(`${where}: media ${id} does not exist`);
    return undefined;
  }
  if (published) ctx.used.set(key(id), hit.downloads);
  return hit.media;
}

/** Replace `media` references inside rich-text blocks with media objects. Does not mutate the input. */
function remapBlocks(ctx, node, where, published) {
  if (Array.isArray(node)) return node.map((n) => remapBlocks(ctx, n, where, published));
  if (!isObject(node)) return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = remapBlocks(ctx, v, where, published);
  if (out.type === 'block' && isObject(out.fields)) {
    if (out.fields.blockType === 'figure') {
      out.fields.media = resolveMedia(ctx, node.fields.media, `${where} (figure)`, published);
    }
    if (out.fields.blockType === 'gallery-strip') {
      const list = Array.isArray(node.fields.media) ? node.fields.media : [];
      out.fields.media = list.map((m) => resolveMedia(ctx, m, `${where} (photo strip)`, published)).filter(Boolean);
    }
  }
  return out;
}

function mapContent(ctx, value, where, published) {
  const rich = localizedRichText(value);
  if (!rich) return {};
  return Object.fromEntries(Object.entries(rich).map(([l, doc]) => [l, remapBlocks(ctx, doc, `${where} [${l}]`, published)]));
}

const statusOf = (doc) => (doc._status === 'published' ? 'published' : 'draft');

// ---------------------------------------------------------------- collections

export function mapPost(ctx, doc) {
  const status = statusOf(doc);
  const published = status === 'published';
  const where = `post "${doc.slug}"`;
  const category = ctx.categories.get(key(idOf(doc.category)));
  if (!category) throw new Error(`${where}: category ${idOf(doc.category)} does not exist`);
  const tags = (doc.tags ?? []).map((t) => ctx.tags.get(key(idOf(t)))).filter(Boolean);
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
    publishedIn: Object.fromEntries(LOCALES.map((l) => [l, doc.publishedIn?.[l] === true])),
    title: localized(doc.title) ?? {},
    description: localized(doc.description) ?? {},
    content: mapContent(ctx, doc.content, where, published),
  };
}

export function mapProject(ctx, doc) {
  const status = statusOf(doc);
  const published = status === 'published';
  const where = `project "${doc.slug}"`;
  const hero = resolveMedia(ctx, doc.hero, `${where} cover`, published);
  return {
    id: key(doc.id),
    _status: status,
    slug: doc.slug,
    status: doc.status,
    stack: (doc.stack ?? []).map((s) => s.label).filter(Boolean),
    ...(doc.repo ? { repo: doc.repo } : {}),
    links: (doc.links ?? []).map((l) => ({ label: l.label, url: l.url })),
    featured: doc.featured === true,
    order: typeof doc.order === 'number' ? doc.order : 100,
    ...(hero ? { hero } : {}),
    title: localized(doc.title) ?? {},
    summary: localized(doc.summary) ?? {},
    content: mapContent(ctx, doc.content, where, published),
  };
}

export function mapPage(ctx, doc) {
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

export function mapSite(g) {
  return {
    name: localized(g.name) ?? {},
    tagline: localized(g.tagline) ?? {},
    email: g.email,
    socials: (g.socials ?? []).map((s) => ({ label: s.label, url: s.url })),
    nav: g.nav ?? [],
    navMore: g.navMore ?? [],
  };
}

export function mapNow(ctx, g) {
  return { updatedAt: g.updatedAt, content: mapContent(ctx, g.content, 'now', true) };
}

export function mapUses(g) {
  return {
    groups: (g.groups ?? []).map((group) => ({
      id: key(group.id),
      title: localized(group.title) ?? {},
      items: (group.items ?? []).map((it) => ({
        id: key(it.id),
        name: localized(it.name) ?? {},
        ...(localized(it.note) ? { note: localized(it.note) } : {}),
      })),
    })),
  };
}

export function mapResume(g) {
  const dropEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const b = g.basics ?? {};
  return {
    updatedAt: g.updatedAt,
    basics: {
      name: b.name,
      label: b.label,
      email: b.email,
      url: b.url ?? '',
      summary: b.summary ?? '',
      profiles: (b.profiles ?? []).map((p) => ({ network: p.network, url: p.url })),
    },
    work: (g.work ?? []).map((w) =>
      dropEmpty({
        id: key(w.id),
        name: w.name,
        position: w.position,
        startDate: w.startDate,
        endDate: w.endDate,
        highlights: (w.highlights ?? []).map((h) => h.text),
      }),
    ),
    education: (g.education ?? []).map((e) =>
      dropEmpty({
        id: key(e.id),
        institution: e.institution,
        area: e.area,
        studyType: e.studyType,
        startDate: e.startDate,
        endDate: e.endDate,
      }),
    ),
    skills: (g.skills ?? []).map((s) => ({ id: key(s.id), name: s.name, keywords: (s.keywords ?? []).map((k) => k.text) })),
    projects: (g.projects ?? []).map((p) => dropEmpty({ id: key(p.id), name: p.name, description: p.description, url: p.url })),
    languages: (g.languages ?? []).map((l) => ({ id: key(l.id), language: l.language, spoken: l.spoken, reading: l.reading })),
    certificates: (g.certificates ?? []).map((c) => ({ id: key(c.id), name: c.name, issuer: c.issuer, date: c.date })),
  };
}

// ---------------------------------------------------------------- everything

/**
 * @param {{ media, categories, tags, posts, projects, pages, globals: { site, now, uses, resume } }} raw
 * @returns {{ files: Map<string, Json>, downloads: { from: string, name: string }[], counts: Json }}
 *   `files` is keyed by the path under src/content/cms/ (the same layout as the fixtures).
 */
export function mapAll(raw) {
  const ctx = createContext(raw);
  const files = new Map();

  for (const doc of raw.posts) files.set(`posts/${doc.slug}.json`, mapPost(ctx, doc));
  for (const doc of raw.projects) files.set(`projects/${doc.slug}.json`, mapProject(ctx, doc));
  for (const doc of raw.pages) files.set(`pages/${doc.slug}.json`, mapPage(ctx, doc));
  files.set('site.json', mapSite(raw.globals.site));
  files.set('now.json', mapNow(ctx, raw.globals.now));
  files.set('uses.json', mapUses(raw.globals.uses));
  files.set('resume.json', mapResume(raw.globals.resume));

  const slugs = new Set();
  for (const doc of raw.posts) {
    if (slugs.has(doc.slug)) throw new Error(`duplicate post slug "${doc.slug}"`);
    slugs.add(doc.slug);
  }
  // Same file may be referenced twice (a photo strip repeating an image): download once.
  const seen = new Map();
  for (const list of ctx.used.values()) for (const d of list) seen.set(d.name, d);

  return {
    files,
    downloads: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    counts: {
      posts: raw.posts.length,
      publishedPosts: raw.posts.filter((p) => p._status === 'published').length,
      projects: raw.projects.length,
      pages: raw.pages.length,
      media: ctx.used.size,
    },
  };
}
