// Post-build gates over dist/ (docs/PLAN.md: Security, Build-time validation, i18n rules).
// Exits non-zero with a list of every violation.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
// The same source the build used (src/lib/cms.ts): pulled CMS content unless SITE_CONTENT=fixtures or nothing was pulled.
const cmsDir = join(root, 'src/content/cms');
const useCms = process.env.SITE_CONTENT !== 'fixtures' && existsSync(join(cmsDir, 'site.json'));
const contentRoot = useCms ? cmsDir : join(root, 'src/content/fixtures');
const SITE = 'https://smkabir.com';
const errors = [];
const fail = (msg) => errors.push(msg);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (f) => '/' + relative(dist, f);

const files = walk(dist);
const allHtml = files.filter((f) => f.endsWith('.html'));
// /embeds/*.html are author-supplied documents with inline script, served with their own sandboxing headers
// (src/lib/embeds.ts). They are checked separately below and are not pages: no title, canonical or lang rules.
const embedFiles = allHtml.filter((f) => rel(f).startsWith('/embeds/'));
const htmlFiles = allHtml.filter((f) => !rel(f).startsWith('/embeds/'));
// Everything a crawler or a reader could fetch as text. Pagefind's index is binary, so it is checked separately.
const textFiles = files.filter((f) => ['.html', '.xml', '.json', '.txt'].includes(extname(f)) && !f.includes('/pagefind/'));

const htmlCache = new Map();
const htmlOf = (file) => {
  if (!htmlCache.has(file)) htmlCache.set(file, readFileSync(file, 'utf8'));
  return htmlCache.get(file);
};

/** Resolve a URL path (no origin) to the file that serves it, or null. */
function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  if (clean === '' || clean === '/') return join(dist, 'index.html');
  const target = join(dist, clean);
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, 'index.html');
  return existsSync(index) ? index : null;
}

/** What the content says should exist: the locale rule is re-derived here, independently of the site code. */
const postsDir = join(contentRoot, 'posts');
const posts = existsSync(postsDir) ? readdirSync(postsDir).map((f) => JSON.parse(readFileSync(join(postsDir, f), 'utf8'))) : [];
const LOCALES = ['en', 'ja'];
// "Has something in it": a non-empty text node or any block. An untouched editor (empty paragraph) does not count.
const hasText = (root) => /"text":"[^"]/.test(JSON.stringify(root ?? {})) || JSON.stringify(root ?? {}).includes('"blockType"');
const hasPage = (p, l) =>
  p._status === 'published' &&
  p.publishedIn?.[l] === true &&
  !!p.title?.[l] &&
  !!p.description?.[l] &&
  hasText(p.content?.[l]) &&
  (!p.hero || !!p.hero.alt?.[l]);
const draftSlugs = posts.filter((p) => p._status !== 'published').map((p) => p.slug);

// ---- per page ----------------------------------------------------------------------------------
const noindexPages = new Set();
for (const file of htmlFiles) {
  const html = htmlOf(file);
  const page = rel(file);

  // No inline scripts: CSP is script-src 'self'. JSON-LD data blocks are not executed and are fine.
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (!/\bsrc=/.test(attrs) && !/type=["']application\/ld\+json["']/.test(attrs))
      fail(`${page}: inline <script> (${attrs.trim() || 'no attrs'})`);
  }
  // Inline event handlers (double or single quoted), outside <pre> code samples.
  if (/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<pre[\s\S]*?<\/pre>/g, ''))) fail(`${page}: inline event-handler attribute`);

  const lang = /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1];
  const expected = page.startsWith('/ja/') ? 'ja' : 'en';
  if (page !== '/404.html' && lang !== expected) fail(`${page}: <html lang="${lang}"> but expected "${expected}"`);
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${page}: missing <title>`);
  if (!/<link rel="canonical"/.test(html)) fail(`${page}: missing canonical`);
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) noindexPages.add(page);

  // Internal references (root-relative AND absolute to this site) must resolve; srcset candidates too.
  const refs = [];
  for (const m of html.matchAll(/\b(?:href|src|content)="((?:\/(?!\/)|https:\/\/smkabir\.com\/)[^"]*)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) for (const c of m[1].split(',')) refs.push(c.trim().split(/\s+/)[0]);
  for (const ref of refs) {
    const path = ref.startsWith(SITE) ? ref.slice(SITE.length) || '/' : ref;
    if (path.startsWith('/pagefind/')) continue; // generated after this check
    const target = resolvePath(path);
    if (!target) {
      fail(`${page}: broken reference ${ref}`);
      continue;
    }
    // #fragment: the id must exist in the page it points at.
    const hash = ref.includes('#') ? decodeURIComponent(ref.split('#')[1]) : '';
    if (
      hash &&
      target.endsWith('.html') &&
      !new RegExp(`\\bid=["']${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(htmlOf(target))
    )
      fail(`${page}: ${ref} points at a missing #${hash}`);
  }
  // Same-page anchors.
  for (const m of html.matchAll(/\bhref="#([^"]+)"/g)) {
    const id = decodeURIComponent(m[1]);
    if (!new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) fail(`${page}: #${id} has no target`);
  }
}

// ---- HTML embeds: isolated, referenced, and carrying nothing that could leak -------------------------------------------
{
  const referenced = new Set();
  for (const file of htmlFiles) {
    for (const tag of htmlOf(file).matchAll(/<iframe\b[^>]*>/gi)) {
      const src = /\bsrc="([^"]*)"/.exec(tag[0])?.[1] ?? '';
      if (!src.startsWith('/embeds/')) {
        // The only frames the site is allowed to contain are its embeds and the Turnstile widget (added by script).
        fail(`${rel(file)}: <iframe src="${src}"> points outside /embeds/`);
        continue;
      }
      referenced.add(src);
      const sandbox = /\bsandbox="([^"]*)"/.exec(tag[0])?.[1];
      // `allow-scripts` alone: no allow-same-origin (opaque origin), no top navigation, popups, forms or downloads.
      if (sandbox === undefined || sandbox.trim() !== 'allow-scripts')
        fail(`${rel(file)}: embed frame ${src} must have sandbox="allow-scripts" and nothing else (has ${JSON.stringify(sandbox)})`);
      if (!resolvePath(src)) fail(`${rel(file)}: embed ${src} does not exist`);
    }
  }
  // Same denylist as the repository scan, applied to what the CMS supplied.
  const deny = (process.env.PRIVACY_DENYLIST ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const { scanText } = await import('../../../scripts/privacy-scan.mjs');
  for (const file of embedFiles) {
    const page = rel(file);
    const html = readFileSync(file, 'utf8');
    if (!referenced.has(page)) fail(`${page}: embed file that no page uses`);
    if (!/<meta name="robots" content="noindex/.test(html)) fail(`${page}: embed is missing noindex`);
    // Everything must be inline: the embed CSP blocks remote loads, so a remote reference is a bug to fix now.
    for (const m of html.matchAll(
      /<(script|link|img|iframe|object|embed|video|audio|source)\b[^>]*\b(?:src|href|data)\s*=\s*["']?(?:https?:)?\/\//gi,
    ))
      fail(`${page}: embed loads a remote resource (<${m[1]}>); inline it (remote loads are blocked)`);
    if (/@import\s+(?:url\()?["']?(?:https?:)?\/\//i.test(html)) fail(`${page}: embed @imports a remote stylesheet`);
    for (const hit of scanText(html, deny, { phones: false })) fail(`${page}: ${hit}`);
  }
}

// ---- drafts never appear anywhere text is served --------------------------------------------------
for (const slug of draftSlugs) {
  if (resolvePath(`/posts/${slug}/`) || resolvePath(`/ja/posts/${slug}/`)) fail(`dist contains a page for draft "${slug}"`);
  for (const f of textFiles) if (readFileSync(f, 'utf8').includes(slug)) fail(`${rel(f)} mentions draft "${slug}"`);
}
for (const f of textFiles) if (readFileSync(f, 'utf8').includes('DRAFT-ONLY-MARKER')) fail(`${rel(f)} contains draft-only content`);

// ---- the locale rule: a page exists in a locale exactly when every required field does ----------------
for (const p of posts) {
  for (const l of LOCALES) {
    const path = l === 'en' ? `/posts/${p.slug}/` : `/ja/posts/${p.slug}/`;
    const exists = Boolean(resolvePath(path));
    if (exists && !hasPage(p, l)) fail(`${path} was built but "${p.slug}" is missing a required ${l} field (or is unpublished)`);
    if (!exists && hasPage(p, l)) fail(`${path} is missing although "${p.slug}" has every required ${l} field`);
  }
}

// ---- sitemap: indexable pages only, and every entry exists ------------------------------------------------
const sitemapFiles = files.filter((f) => /sitemap-\d+\.xml$/.test(f));
const sitemapped = new Set();
for (const f of sitemapFiles)
  for (const m of readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const path = m[1].startsWith(SITE) ? m[1].slice(SITE.length) : m[1];
    sitemapped.add(path);
    if (!resolvePath(path)) fail(`sitemap lists ${path}, which does not exist`);
    if (noindexPages.has(path === '/' ? '/index.html' : `${path}index.html`)) fail(`sitemap lists ${path}, which is noindex`);
  }
if (sitemapFiles.length === 0) fail('no sitemap-*.xml');

if (!htmlFiles.some((f) => rel(f) === '/index.html')) fail('no /index.html');
// The typography page is a Phase 1 gate artifact: only allowed when explicitly requested.
if (existsSync(join(dist, 'ja/typography-test')) && process.env.SITE_TYPOGRAPHY_TEST !== '1')
  fail('typography test page leaked into the build (set SITE_TYPOGRAPHY_TEST=1 only for the gate)');

if (errors.length) {
  console.error(`check-dist: ${errors.length} problem(s)\n - ${[...new Set(errors)].join('\n - ')}`);
  process.exit(1);
}
console.log(
  `check-dist: ${htmlFiles.length} pages OK, ${embedFiles.length} isolated embed${embedFiles.length === 1 ? '' : 's'} (no inline scripts outside /embeds/, lang per locale, no drafts in any text file, ` +
    `locale rule matches content, references and #anchors resolve, sitemap has ${sitemapped.size} indexable URLs)`,
);
