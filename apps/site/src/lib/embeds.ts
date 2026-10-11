// HTML embeds: author-supplied HTML (with inline script) from the CMS "HTML embed" block.
//
// Safety model, in one place so it can be reviewed:
//   1. The HTML never appears in a page. Each embed is written to its own file, /embeds/<hash>.html, and pages show it
//      in <iframe sandbox="allow-scripts"> (no allow-same-origin): the frame is an opaque origin.
//   2. nginx serves /embeds/ with its own headers (security-headers.json, `embeds`): a CSP with `sandbox allow-scripts`
//      (so the document is isolated even when its URL is opened directly), `connect-src 'none'` (nothing can be sent
//      out) and `default-src 'none'` (no remote scripts, styles, fonts or frames: everything must be inline).
//   3. The page policy is unchanged: still no inline script anywhere outside /embeds/.
// check-dist.mjs verifies 1 and 3 on the built site.
import { createHash } from 'node:crypto';
import type { Locale } from '~/i18n';
import { locales } from '~/i18n';
import { getAllPages, getNow, getPosts, getProjects } from './cms';
import type { LexicalNode, LexicalRoot } from './lexical/types';

export const EMBED_BLOCK = 'html-embed';
export const EMBED_MESSAGE = 'kabir-embed-height';
/** Upper bound on one embed's source. The CMS field has the same limit. */
export const MAX_EMBED_BYTES = 300_000;

export const embedId = (html: string): string => createHash('sha256').update(html, 'utf8').digest('hex').slice(0, 24);
export const embedPath = (html: string): string => `/embeds/${embedId(html)}.html`;

// Tells the parent page how tall the content is, so the frame can fit it. It carries one number and nothing else.
// The body's bottom edge (not documentElement.scrollHeight, which can never shrink below the frame) is measured.
const RESIZE_SCRIPT = `(function(){function m(){var b=document.body;if(!b)return;var r=b.getBoundingClientRect();var s=getComputedStyle(b);var h=Math.ceil(r.bottom+window.pageYOffset+(parseFloat(s.marginBottom)||0));parent.postMessage({type:${JSON.stringify(
  EMBED_MESSAGE,
)},height:h},"*")}if(window.ResizeObserver){new ResizeObserver(m).observe(document.documentElement)}window.addEventListener("load",m);window.addEventListener("resize",m);m()})();`;

const FULL_DOCUMENT = /^\s*(<!doctype\b|<html\b)/i;

/**
 * The file served at /embeds/<hash>.html. Full documents are kept as written; a fragment is wrapped. Added to both:
 * `noindex` and the resize reporter. Pure: same input, same output.
 */
export function embedDocument(html: string, title: string, lang: string): string {
  if (Buffer.byteLength(html, 'utf8') > MAX_EMBED_BYTES) throw new Error(`HTML embed "${title}" is larger than ${MAX_EMBED_BYTES} bytes`);
  const robots = '<meta name="robots" content="noindex, nofollow">';
  const reporter = `<script>${RESIZE_SCRIPT}</script>`;
  let doc = FULL_DOCUMENT.test(html)
    ? html
    : `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escapeText(title)}</title></head><body>${html}</body></html>`;
  doc = /<head\b[^>]*>/i.test(doc)
    ? doc.replace(/<head\b[^>]*>/i, (m) => `${m}${robots}`)
    : doc.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${robots}</head>`);
  doc = /<\/body\s*>/i.test(doc) ? doc.replace(/<\/body\s*>/i, `${reporter}</body>`) : `${doc}${reporter}`;
  return doc;
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface FoundEmbed {
  id: string;
  html: string;
  title: string;
  lang: Locale;
}

/** Every HTML embed block inside a rich-text document, including inside callouts. */
export function embedsIn(doc: LexicalRoot | undefined, lang: Locale, into: FoundEmbed[] = []): FoundEmbed[] {
  const visit = (n: LexicalNode) => {
    if ('children' in n && Array.isArray(n.children)) n.children.forEach(visit);
    if (n.type !== 'block') return;
    const f = ((n as { fields?: Record<string, unknown> }).fields ?? {}) as Record<string, unknown>;
    if (f.blockType === EMBED_BLOCK && typeof f.html === 'string') {
      into.push({ id: embedId(f.html), html: f.html, title: String(f.title ?? 'Interactive content'), lang });
    }
    const body = f.body as LexicalRoot | undefined;
    if (body?.root) body.root.children.forEach(visit);
  };
  doc?.root.children.forEach(visit);
  return into;
}

/**
 * The embeds of everything the site actually renders: published posts and projects (in the locales that have a page),
 * pages and Now. A draft's embed is never written to dist/, same as a draft's page.
 */
export function collectEmbeds(): FoundEmbed[] {
  const found: FoundEmbed[] = [];
  for (const locale of locales) {
    for (const p of getPosts(locale)) embedsIn(p.content, locale, found);
    for (const p of getProjects(locale)) embedsIn(p.content, locale, found);
    for (const p of getAllPages(locale)) embedsIn(p.content, locale, found);
    embedsIn(getNow().content[locale], locale, found);
  }
  const unique = new Map<string, FoundEmbed>();
  for (const e of found) if (!unique.has(e.id)) unique.set(e.id, e);
  return [...unique.values()];
}
