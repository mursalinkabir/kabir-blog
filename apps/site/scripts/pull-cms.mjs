// Pulls content from Payload into apps/site/src/content/cms/ (and media into apps/site/public/media/), in the same
// layout as the fixtures, so the site reads one or the other without any other change (src/lib/cms.ts).
//
//   CMS_URL=http://localhost:3100 CMS_API_KEY=... node scripts/pull-cms.mjs [--raw <file>]
//
//   CMS_URL                  base URL of the CMS (default http://localhost:3100)
//   CMS_API_KEY              the read-only builder user's API key (required)
//   CF_ACCESS_CLIENT_ID /    Cloudflare Access service token, when the CMS is behind Access (both or neither)
//   CF_ACCESS_CLIENT_SECRET
//   --raw <file>             also write the raw API responses there (used to capture test data)
//
// All or nothing: everything is fetched and mapped in memory first, and the output directories are replaced only
// when that succeeded. An unreachable CMS, an HTTP error or zero published posts leaves the previous output alone
// and exits non-zero, so a build can never ship a half-empty site.
import { mkdirSync, writeFileSync, rmSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mapAll } from './lib/cms-map.mjs';

const root = new URL('../', import.meta.url).pathname;
const outDir = join(root, 'src/content/cms');
const mediaDir = join(root, 'public/media');

const CMS_URL = (process.env.CMS_URL || 'http://localhost:3100').replace(/\/+$/, '');
const apiKey = process.env.CMS_API_KEY;
const rawIndex = process.argv.indexOf('--raw');
const rawFile = rawIndex > 0 ? process.argv[rawIndex + 1] : undefined;

if (!apiKey) {
  console.error('pull-cms: CMS_API_KEY is not set (the read-only builder key; see docs/cms.md)');
  process.exit(1);
}
if (Boolean(process.env.CF_ACCESS_CLIENT_ID) !== Boolean(process.env.CF_ACCESS_CLIENT_SECRET)) {
  console.error('pull-cms: set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, or neither');
  process.exit(1);
}

const headers = {
  Authorization: `users API-Key ${apiKey}`,
  ...(process.env.CF_ACCESS_CLIENT_ID
    ? {
        'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET,
      }
    : {}),
};

async function get(path, { binary = false } = {}) {
  const url = `${CMS_URL}${path}`;
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new Error(`cannot reach ${CMS_URL} (${error.cause?.code ?? error.message})`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path.split('?')[0]}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

// `locale=all` returns every language side by side; `fallback-locale=none` makes sure a missing one stays missing.
const QUERY = 'locale=all&fallback-locale=none&depth=0&draft=false';

async function collection(slug) {
  const docs = [];
  for (let page = 1; ; page++) {
    const body = await get(`/api/${slug}?${QUERY}&limit=100&page=${page}&sort=id`);
    docs.push(...body.docs);
    if (!body.hasNextPage) return docs;
  }
}
const global = (slug) => get(`/api/globals/${slug}?${QUERY}`);

try {
  const [media, categories, tags, posts, projects, pages, site, now, uses, resume] = await Promise.all([
    collection('media'),
    collection('categories'),
    collection('tags'),
    collection('posts'),
    collection('projects'),
    collection('pages'),
    global('site'),
    global('now'),
    global('uses'),
    global('resume'),
  ]);
  const raw = { media, categories, tags, posts, projects, pages, globals: { site, now, uses, resume } };
  if (rawFile) {
    mkdirSync(dirname(rawFile), { recursive: true });
    writeFileSync(rawFile, JSON.stringify(raw, null, 2) + '\n');
  }

  const { files, downloads, counts } = mapAll(raw);
  if (counts.publishedPosts === 0) throw new Error('the CMS has no published posts; refusing to replace the site content');

  // Download first, into a staging folder, so a failed download cannot leave media half replaced.
  const stagingMedia = `${mediaDir}.next`;
  rmSync(stagingMedia, { recursive: true, force: true });
  mkdirSync(stagingMedia, { recursive: true });
  for (const d of downloads) writeFileSync(join(stagingMedia, d.name), await get(d.from, { binary: true }));

  const stagingOut = `${outDir}.next`;
  rmSync(stagingOut, { recursive: true, force: true });
  for (const [path, value] of files) {
    const file = join(stagingOut, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  }
  writeFileSync(
    join(stagingOut, '_source.json'),
    JSON.stringify({ pulledAt: new Date().toISOString(), cms: CMS_URL, ...counts }, null, 2) + '\n',
  );

  rmSync(outDir, { recursive: true, force: true });
  renameSync(stagingOut, outDir);
  rmSync(mediaDir, { recursive: true, force: true });
  renameSync(stagingMedia, mediaDir);

  console.log(
    `pull-cms: ${counts.posts} posts (${counts.publishedPosts} published), ${counts.projects} projects, ` +
      `${counts.pages} pages, ${downloads.length} media files from ${CMS_URL}`,
  );
  if (!existsSync(mediaDir) || readdirSync(mediaDir).length !== downloads.length) {
    throw new Error('media folder does not match the download list');
  }
} catch (error) {
  console.error(`pull-cms: ${error.message}`);
  process.exit(1);
}
