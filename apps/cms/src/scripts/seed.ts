/**
 * Local development seed: loads the site fixtures (apps/site/src/content/fixtures) into Payload, so the CMS and the
 * site can be developed against realistic content. Run with `pnpm --filter @smkabir/cms seed`.
 *
 * Safe by construction:
 *   - refuses to run unless DATABASE_URL points at this machine;
 *   - does nothing when content already exists, unless SEED_RESET=1 (which empties the content collections first);
 *   - writes the generated admin password and the read-only API key to apps/cms/.dev-credentials (git-ignored)
 *     instead of printing them or committing a default password.
 *
 * Production content is never seeded: it is written in the admin.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getPayload, type CollectionSlug, type Payload } from 'payload';
import config from '../payload.config';

const here = path.dirname(fileURLToPath(import.meta.url));
const cmsRoot = path.resolve(here, '../..');
const siteRoot = path.resolve(cmsRoot, '../site');
const fixtures = path.join(siteRoot, 'src/content/fixtures');

const LOCALES = ['en', 'ja'] as const;
type Locale = (typeof LOCALES)[number];
type Localized<T> = Partial<Record<Locale, T>>;
type Json = Record<string, any>; // fixture JSON is untyped on purpose: this is a one-off importer

// Payload's data types demand every required field even for the first of two locale passes; the real checks
// are Payload's own validators, which run on every write below.
const data = (x: unknown) => x as never;

const readJson = async (rel: string): Promise<Json> => JSON.parse(await fs.readFile(path.join(fixtures, rel), 'utf8'));
const readDir = async (rel: string): Promise<Json[]> => {
  const names = (await fs.readdir(path.join(fixtures, rel))).filter((n) => n.endsWith('.json')).sort();
  return Promise.all(names.map((n) => readJson(path.join(rel, n))));
};

function assertLocal() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`seed: refusing to run against database host "${host || 'unknown'}". It only runs against localhost.`);
  }
}

const hasValue = (v: unknown): boolean => {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

/** Locales in which at least one of the localized fields has a value, default locale first. */
function activeLocales(perLocale: Record<Locale, Json>): Locale[] {
  const active = LOCALES.filter((l) => Object.values(perLocale[l]).some(hasValue));
  return active.length ? active : ['en'];
}

/**
 * Create a document in the first locale it has content for, then add each further locale as an update.
 * Payload stores a localized field per locale, so this is how a two-language document is written through the API.
 */
async function writeDoc(
  payload: Payload,
  collection: CollectionSlug,
  base: Json,
  perLocale: Record<Locale, Json>,
  extra: { draft?: boolean } = {},
): Promise<number | string> {
  const [first, ...rest] = activeLocales(perLocale);
  const created = await payload.create({
    collection,
    locale: first,
    data: data({ ...base, ...perLocale[first] }),
    ...extra,
  } as never);
  const id = (created as { id: number | string }).id;
  for (const locale of rest) {
    await payload.update({ collection, id, locale, data: data(perLocale[locale]), ...extra } as never);
  }
  return id;
}

/** Build `{ en: ..., ja: ... }` by calling `fn` once per locale. */
const byLocale = (fn: (l: Locale) => Json): Record<Locale, Json> => ({ en: fn('en'), ja: fn('ja') });

const pickLocale = <T>(value: Localized<T> | undefined, locale: Locale): T | undefined => value?.[locale];

// ---------------------------------------------------------------- media

async function uploadMedia(payload: Payload, m: Json): Promise<number | string> {
  // The fixtures' placeholder illustrations are SVG, which the CMS refuses on purpose. Rasterise them.
  const rel = String(m.url).replace(/^\//, '');
  const src = path.join(siteRoot, 'public', rel);
  let buffer = await fs.readFile(src);
  let name = path.basename(src);
  let mimetype = String(m.mimeType);
  if (mimetype === 'image/svg+xml') {
    buffer = await sharp(buffer).webp({ quality: 90 }).toBuffer();
    name = name.replace(/\.svg$/, '.webp');
    mimetype = 'image/webp';
  }
  const created = await payload.create({
    collection: 'media',
    locale: 'en',
    data: data({ alt: m.alt.en, credit: m.credit }),
    file: { data: buffer, mimetype, name, size: buffer.length },
  });
  if (m.alt.ja) {
    await payload.update({ collection: 'media', id: created.id, locale: 'ja', data: data({ alt: m.alt.ja }) });
  }
  return created.id;
}

// ---------------------------------------------------------------- rich text

/** Walk a Lexical tree and swap the fixtures' embedded media objects for the ids Payload stores. */
function remapMedia(node: unknown, ids: Map<string, number | string>): unknown {
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

const lexicalFor = (field: Localized<unknown> | undefined, locale: Locale, ids: Map<string, number | string>) => {
  const value = pickLocale(field, locale);
  return value ? remapMedia(value, ids) : undefined;
};

// ---------------------------------------------------------------- main

const seeded: CollectionSlug[] = ['posts', 'projects', 'pages', 'media', 'tags', 'categories'];

async function main() {
  assertLocal();
  const payload = await getPayload({ config });

  const existing = await payload.find({ collection: 'posts', draft: true, limit: 1, depth: 0 });
  if (existing.totalDocs > 0 && process.env.SEED_RESET !== '1') {
    console.log('seed: content already exists; nothing to do (SEED_RESET=1 empties it first).');
    return;
  }
  if (process.env.SEED_RESET === '1') {
    for (const collection of seeded) {
      await payload.delete({ collection, where: { id: { exists: true } } } as never);
    }
    console.log(`seed: emptied ${seeded.join(', ')}`);
  }

  // ---- users: one admin for the admin UI, one read-only reader whose API key the site builder uses
  const creds: string[] = ['# Local development only. Git-ignored. Regenerated by `pnpm seed` when users are missing.'];
  const adminEmail = 'admin@smkabir.test';
  const readerEmail = 'builder@smkabir.test';
  const haveAdmin = (await payload.count({ collection: 'users', where: { email: { equals: adminEmail } } })).totalDocs;
  if (!haveAdmin) {
    const password = crypto.randomBytes(18).toString('base64url');
    await payload.create({ collection: 'users', data: data({ email: adminEmail, password, name: 'Local admin', role: 'admin' }) });
    creds.push(`ADMIN_EMAIL=${adminEmail}`, `ADMIN_PASSWORD=${password}`);
  }
  const haveReader = (await payload.count({ collection: 'users', where: { email: { equals: readerEmail } } })).totalDocs;
  if (!haveReader) {
    const apiKey = crypto.randomBytes(24).toString('hex');
    await payload.create({
      collection: 'users',
      data: data({
        email: readerEmail,
        password: crypto.randomBytes(18).toString('base64url'),
        name: 'Site builder (read-only)',
        role: 'reader',
        enableAPIKey: true,
        apiKey,
      }),
    });
    creds.push(`CMS_API_KEY=${apiKey}`);
  }
  if (creds.length > 1) {
    const file = path.join(cmsRoot, '.dev-credentials');
    await fs.writeFile(file, creds.join('\n') + '\n', { mode: 0o600 });
    console.log(`seed: wrote ${path.relative(process.cwd(), file) || file}`);
  }

  // ---- load fixtures
  const [posts, projects, pages] = await Promise.all([readDir('posts'), readDir('projects'), readDir('pages')]);
  const [site, now, uses, resume] = await Promise.all(['site', 'now', 'uses', 'resume'].map((n) => readJson(`${n}.json`)));

  // ---- media (each distinct fixture image once)
  const mediaFixtures = new Map<string, Json>();
  const collect = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(collect);
    if (!n || typeof n !== 'object') return;
    const o = n as Json;
    if (typeof o.id === 'string' && typeof o.url === 'string' && o.alt) mediaFixtures.set(o.id, o);
    Object.values(o).forEach(collect);
  };
  collect([posts, projects, pages]);
  const mediaIds = new Map<string, number | string>();
  for (const [fixtureId, m] of mediaFixtures) mediaIds.set(fixtureId, await uploadMedia(payload, m));
  console.log(`seed: ${mediaIds.size} media`);

  // ---- categories and tags (embedded in the posts)
  const categories = new Map<string, Json>();
  const tags = new Map<string, Json>();
  for (const p of posts) {
    categories.set(p.category.slug, p.category);
    for (const t of p.tags ?? []) tags.set(t.slug, t);
  }
  const categoryIds = new Map<string, number | string>();
  for (const [slug, c] of categories) {
    categoryIds.set(slug, await writeDoc(payload, 'categories', { slug }, { en: { name: c.name.en }, ja: { name: c.name.ja } }));
  }
  const tagIds = new Map<string, number | string>();
  for (const [slug, t] of tags) {
    tagIds.set(slug, await writeDoc(payload, 'tags', { slug }, { en: { name: t.name.en }, ja: { name: t.name.ja } }));
  }

  // ---- posts
  for (const p of posts) {
    const isDraft = p._status === 'draft';
    const base: Json = {
      slug: p.slug,
      category: categoryIds.get(p.category.slug),
      tags: (p.tags ?? []).map((t: Json) => tagIds.get(t.slug)),
      pubDate: p.pubDate,
      updatedDate: p.updatedDate,
      hero: p.hero ? mediaIds.get(p.hero.id) : undefined,
      series: p.series,
      toc: p.toc,
      _status: isDraft ? 'draft' : 'published',
    };
    const perLocale = byLocale((l) => ({
      title: pickLocale(p.title, l),
      description: pickLocale(p.description, l),
      publishedIn: Boolean(p.publishedIn?.[l]),
      content: lexicalFor(p.content, l, mediaIds),
    }));
    await writeDoc(payload, 'posts', base, perLocale, { draft: isDraft });
  }
  console.log(`seed: ${posts.length} posts`);

  // ---- projects
  for (const p of projects) {
    const isDraft = p._status === 'draft';
    const base: Json = {
      slug: p.slug,
      status: p.status,
      stack: (p.stack ?? []).map((label: string) => ({ label })),
      repo: p.repo,
      links: p.links ?? [],
      featured: p.featured,
      order: p.order,
      hero: p.hero ? mediaIds.get(p.hero.id) : undefined,
      _status: isDraft ? 'draft' : 'published',
    };
    const perLocale = byLocale((l) => ({
      title: pickLocale(p.title, l),
      summary: pickLocale(p.summary, l),
      content: lexicalFor(p.content, l, mediaIds),
    }));
    await writeDoc(payload, 'projects', base, perLocale, { draft: isDraft });
  }
  console.log(`seed: ${projects.length} projects`);

  // ---- pages
  for (const p of pages) {
    const isDraft = p._status === 'draft';
    const perLocale = byLocale((l) => ({ title: pickLocale(p.title, l), content: lexicalFor(p.content, l, mediaIds) }));
    await writeDoc(payload, 'pages', { slug: p.slug, _status: isDraft ? 'draft' : 'published' }, perLocale, { draft: isDraft });
  }
  console.log(`seed: ${pages.length} pages`);

  // ---- globals
  const first = async (slug: 'site' | 'now' | 'uses' | 'resume', base: Json, perLocale?: Record<Locale, Json>) => {
    const locales = perLocale ? activeLocales(perLocale) : (['en'] as Locale[]);
    for (const [i, locale] of locales.entries()) {
      await payload.updateGlobal({
        slug,
        locale,
        data: data({ ...(i === 0 ? base : {}), ...(perLocale?.[locale] ?? {}) }),
      });
    }
  };

  await first(
    'site',
    { email: site.email, socials: site.socials, nav: site.nav, navMore: site.navMore },
    byLocale((l) => ({ name: pickLocale(site.name, l), tagline: pickLocale(site.tagline, l) })),
  );
  await first(
    'now',
    {},
    byLocale((l) => ({ content: lexicalFor(now.content, l, mediaIds) })),
  );

  // uses: arrays with localized members. Rows keep the fixture ids so the second pass lines up with the first.
  const usesRows = (l: Locale) =>
    (uses.groups as Json[]).map((g) => ({
      id: g.id,
      title: pickLocale(g.title, l),
      items: (g.items as Json[]).map((it) => ({ id: it.id, name: pickLocale(it.name, l), note: pickLocale(it.note, l) })),
    }));
  await payload.updateGlobal({ slug: 'uses', locale: 'en', data: data({ groups: usesRows('en') }) });
  await payload.updateGlobal({ slug: 'uses', locale: 'ja', data: data({ groups: usesRows('ja') }) });

  await first('resume', {
    basics: resume.basics,
    work: resume.work.map((w: Json) => ({ ...w, highlights: (w.highlights ?? []).map((text: string) => ({ text })) })),
    education: resume.education,
    skills: resume.skills.map((s: Json) => ({ ...s, keywords: (s.keywords ?? []).map((text: string) => ({ text })) })),
    projects: resume.projects,
    languages: resume.languages,
    certificates: resume.certificates,
  });
  console.log('seed: globals written');
  console.log('seed: done');
}

// `payload run` exits as soon as this module has finished loading, so the work must be awaited here.
try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1); // payload's runner would otherwise exit 0
}
