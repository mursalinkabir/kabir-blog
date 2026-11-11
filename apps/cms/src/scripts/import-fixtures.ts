/**
 * Moves the site's content (apps/site/src/content/fixtures) into a running CMS over its REST API. This is how the
 * sample content becomes the real content in production without opening the database: the seed (seed.ts) writes
 * through the Local API and refuses anything but a local database, this one needs only the URL and an admin's API key.
 *
 *   IMPORT_URL=https://cms.smkabir.com IMPORT_API_KEY=... \
 *   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... \
 *   IMPORT_ALLOW_REMOTE=1 [IMPORT_APPLY=1] [IMPORT_FORCE_GLOBALS=1] \
 *     pnpm --filter @smkabir/cms import:fixtures
 *
 * The switches are environment variables because `payload run` hands a script its flags only after a second `--`.
 * (Those flags also work: --apply, --allow-remote, --force-globals.)
 *
 * Safe by construction:
 *   - without IMPORT_APPLY=1 it only reports what it would do (the default);
 *   - a remote URL needs IMPORT_ALLOW_REMOTE=1 and https;
 *   - a document whose slug already exists is skipped and reported, never overwritten; an image is uploaded only when
 *     a document that needs it is being created (the CMS renames a file whose name is taken, so names cannot be
 *     matched); so a second run changes nothing;
 *   - a site-wide setting that already has content is left alone (IMPORT_FORCE_GLOBALS=1 overwrites it);
 *   - the API key and the Access service token come from the environment, never argv, and are never printed;
 *   - only an admin's key is accepted.
 * `payload run` exits as soon as the module loads, so the work is awaited at top level.
 */
import {
  activeLocales,
  collectMedia,
  globalPlans,
  loadFixtures,
  mediaFile,
  pagePlans,
  postPlans,
  projectPlans,
  taxonomy,
  type DocPlan,
  type Ids,
  type Json,
} from './fixtureModel';

const flags = new Set(process.argv.slice(1).filter((a) => a.startsWith('--')));
const on = (flag: string, env: string) => flags.has(flag) || process.env[env] === '1';
const apply = on('--apply', 'IMPORT_APPLY');
const allowRemote = on('--allow-remote', 'IMPORT_ALLOW_REMOTE');
const forceGlobals = on('--force-globals', 'IMPORT_FORCE_GLOBALS');
const base = (process.env.IMPORT_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const key = process.env.IMPORT_API_KEY ?? '';
const cfId = process.env.CF_ACCESS_CLIENT_ID;
const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;

const url = new URL(base);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (!local && !allowRemote)
  throw new Error(`import: ${url.hostname} is not this machine. Set IMPORT_ALLOW_REMOTE=1 if that is what you mean.`);
if (!local && url.protocol !== 'https:') throw new Error('import: a remote CMS must be reached over https.');
if (!key) throw new Error("import: set IMPORT_API_KEY (an admin user's API key, from the admin: Users > the user > Enable API key).");
if (Boolean(cfId) !== Boolean(cfSecret)) throw new Error('import: set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, or neither.');

const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
  Authorization: `users API-Key ${key}`,
  ...(cfId && cfSecret ? { 'CF-Access-Client-Id': cfId, 'CF-Access-Client-Secret': cfSecret } : {}),
  ...extra,
});

async function api(method: string, path: string, body?: unknown, form?: FormData): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: form ? headers() : headers(body === undefined ? {} : { 'content-type': 'application/json' }),
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status >= 300 && res.status < 400)
    throw new Error(
      `import: ${method} ${path} was redirected (to ${res.headers.get('location')?.split('?')[0]}). The Access service token is missing or wrong.`,
    );
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}
const must = (r: { status: number; json: Json }, what: string) => {
  if (r.status < 200 || r.status >= 300)
    throw new Error(`import: ${what} failed (${r.status}): ${JSON.stringify(r.json.errors ?? r.json).slice(0, 400)}`);
  return r.json;
};

const tally: Record<string, { created: number; skipped: number }> = {};
const count = (kind: string, what: 'created' | 'skipped') => {
  tally[kind] ??= { created: 0, skipped: 0 };
  tally[kind][what]++;
};

const enc = encodeURIComponent;

async function findBySlug(collection: string, slug: string): Promise<number | string | undefined> {
  const r = must(
    await api('GET', `/${collection}?where[slug][equals]=${enc(slug)}&draft=true&limit=1&depth=0`),
    `look up ${collection}/${slug}`,
  );
  return r.docs?.[0]?.id;
}

// ---- images are uploaded when a document needs them -------------------------------------------------------------------
const MEDIA = '__media__:';
// The promise is cached, not the id: a document can refer to one image from several places at once.
const uploaded = new Map<string, Promise<number | string>>();
let mediaFixtures: Map<string, Json>;

function ensureMedia(fixtureId: string): Promise<number | string> {
  let p = uploaded.get(fixtureId);
  if (!p) {
    p = uploadMedia(fixtureId);
    uploaded.set(fixtureId, p);
  }
  return p;
}

async function uploadMedia(fixtureId: string): Promise<number | string> {
  const m = mediaFixtures.get(fixtureId);
  if (!m) throw new Error(`import: the content refers to an image "${fixtureId}" that has no fixture.`);
  const { buffer, name, mimetype } = await mediaFile(m);
  // Filenames are unique in the CMS, so an image left by an earlier (partial) run is reused, not uploaded again.
  const found = must(await api('GET', `/media?where[filename][equals]=${enc(name)}&limit=1&depth=0`), `look up media ${name}`);
  if (found.docs?.[0]) {
    count('media', 'skipped');
    console.log(`  reuse   media/${name} (exists)`);
    return found.docs[0].id;
  }
  count('media', 'created');
  if (!apply) {
    console.log(`  would upload media/${name}`);
    return `dry:${fixtureId}`;
  }
  const form = new FormData();
  form.set('_payload', JSON.stringify({ alt: m.alt.en, credit: m.credit }));
  form.set('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), name);
  const id = must(await api('POST', '/media?locale=en', undefined, form), `upload media ${name}`).doc.id as number | string;
  if (m.alt.ja) must(await api('PATCH', `/media/${id}?locale=ja`, { alt: m.alt.ja }), `alt text (ja) for ${name}`);
  console.log(`  uploaded media/${name}`);
  return id;
}

/** Replaces every image placeholder in a document with the id of the uploaded image. */
async function withMedia<T>(value: T): Promise<T> {
  if (typeof value === 'string' && value.startsWith(MEDIA)) return (await ensureMedia(value.slice(MEDIA.length))) as T;
  if (Array.isArray(value)) return (await Promise.all(value.map((v) => withMedia(v)))) as T;
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) out[k] = await withMedia(v);
    return out as T;
  }
  return value;
}

/** Create in the first locale that has content, then add each further locale as an update. */
async function writeDoc(collection: string, plan: DocPlan): Promise<number | string | undefined> {
  const existing = await findBySlug(collection, plan.slug);
  if (existing !== undefined) {
    count(collection, 'skipped');
    console.log(`  skip    ${collection}/${plan.slug} (exists)`);
    return existing;
  }
  count(collection, 'created');
  plan = await withMedia(plan);
  if (!apply) {
    console.log(`  would create ${collection}/${plan.slug}${plan.draft ? ' (draft)' : ''}`);
    return undefined;
  }
  const [first, ...rest] = activeLocales(plan.perLocale);
  const draft = plan.draft ? '&draft=true' : '';
  const created = must(
    await api('POST', `/${collection}?locale=${first}${draft}`, { ...plan.base, ...plan.perLocale[first] }),
    `create ${collection}/${plan.slug}`,
  );
  const id = created.doc.id as number | string;
  for (const locale of rest) {
    must(
      await api('PATCH', `/${collection}/${id}?locale=${locale}${draft}`, plan.perLocale[locale]),
      `add ${locale} to ${collection}/${plan.slug}`,
    );
  }
  console.log(`  created ${collection}/${plan.slug}`);
  return id;
}

try {
  console.log(`import: ${apply ? 'APPLY' : 'dry run (set IMPORT_APPLY=1 to write)'} -> ${url.origin}`);
  const me = must(await api('GET', '/users/me'), 'identify the API key');
  if (me.user?.role !== 'admin') throw new Error(`import: the key belongs to ${me.user ? `a ${me.user.role}` : 'nobody'}, not an admin.`);

  const fx = await loadFixtures();
  mediaFixtures = collectMedia(fx);
  // Placeholders until a document that needs the image is created (see ensureMedia).
  const mediaIds: Ids = new Map([...mediaFixtures.keys()].map((id) => [id, `${MEDIA}${id}`]));

  const tax = taxonomy(fx);
  console.log('categories');
  const categoryIds: Ids = new Map();
  for (const c of tax.categories) categoryIds.set(c.slug, (await writeDoc('categories', c)) ?? `dry:${c.slug}`);
  console.log('tags');
  const tagIds: Ids = new Map();
  for (const t of tax.tags) tagIds.set(t.slug, (await writeDoc('tags', t)) ?? `dry:${t.slug}`);

  const refs = { media: mediaIds, categories: categoryIds, tags: tagIds };
  for (const [collection, plans] of [
    ['posts', postPlans(fx, refs)],
    ['projects', projectPlans(fx, refs)],
    ['pages', pagePlans(fx, refs)],
  ] as const) {
    console.log(collection);
    for (const plan of plans) await writeDoc(collection, plan);
  }

  console.log('site-wide settings');
  const isEmpty: Record<string, (g: Json) => boolean> = {
    site: (g) => !g.name?.en && !g.name?.ja,
    now: (g) => !g.content?.en && !g.content?.ja,
    uses: (g) => !(g.groups?.length > 0),
    resume: (g) => !g.basics?.name,
  };
  for (const g of globalPlans(fx, mediaIds)) {
    const current = must(await api('GET', `/globals/${g.slug}?locale=all&depth=0`), `read ${g.slug}`);
    if (!isEmpty[g.slug](current) && !forceGlobals) {
      count('globals', 'skipped');
      console.log(`  skip    ${g.slug} (already has content; IMPORT_FORCE_GLOBALS=1 overwrites)`);
      continue;
    }
    count('globals', 'created');
    if (!apply) {
      console.log(`  would write ${g.slug}`);
      continue;
    }
    for (const w of await withMedia(g.writes))
      must(await api('POST', `/globals/${g.slug}?locale=${w.locale}`, w.data), `write ${g.slug} (${w.locale})`);
    console.log(`  wrote   ${g.slug}`);
  }

  console.log('\nsummary');
  for (const [kind, t] of Object.entries(tally))
    console.log(`  ${kind.padEnd(11)} ${apply ? 'created' : 'would create'} ${t.created}, skipped ${t.skipped}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
