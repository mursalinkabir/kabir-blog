import type { LexicalNode } from './types';
import { isText } from './types';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * Only same-site paths, anchors, http(s) and mailto survive; anything else (javascript:, data:) becomes "#".
 * Control characters and backslashes are rejected first: browsers normalise `/\evil.com` to `//evil.com`.
 */
export function safeUrl(url: unknown): string {
  const raw = typeof url === 'string' ? url : '';
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '#';
  const u = raw.trim();
  if (/^(\/(?![/\\])|#|https?:\/\/|mailto:)/i.test(u)) return u;
  return '#';
}

const FORMATS: [number, string][] = [
  [16, 'code'],
  [1, 'strong'],
  [2, 'em'],
  [4, 's'],
  [8, 'u'],
  [32, 'sub'],
  [64, 'sup'],
];

export interface InlineOptions {
  /** RSS / plain output: no tooltip markup, internal links made absolute against `origin`. */
  feed?: boolean;
  origin?: string;
}

/** Inline children -> escaped HTML. Used by the Astro renderer and the RSS serializer. */
export function inlineToHtml(nodes: LexicalNode[] = [], opts: InlineOptions = {}): string {
  return nodes.map((n) => inlineNode(n, opts)).join('');
}

function inlineNode(node: LexicalNode, opts: InlineOptions): string {
  if (isText(node)) {
    let html = escapeHtml(node.text);
    for (const [bit, tag] of FORMATS) if (node.format & bit) html = `<${tag}>${html}</${tag}>`;
    return html;
  }
  switch (node.type) {
    case 'linebreak':
      return '<br>';
    case 'tab':
      return '\t';
    case 'link':
    case 'autolink': {
      const fields = (node.fields ?? {}) as { url?: string; newTab?: boolean };
      let url = safeUrl(fields.url);
      if (opts.feed && opts.origin && url.startsWith('/')) url = new URL(url, opts.origin).toString();
      const external = /^https?:\/\//i.test(url) && !(opts.origin && url.startsWith(opts.origin));
      const attrs = fields.newTab || external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(url)}"${attrs}>${inlineToHtml(node.children, opts)}</a>`;
    }
    case 'inlineBlock': {
      const f = (node.fields ?? {}) as { blockType?: string; t?: string; r?: string; en?: string };
      if (f.blockType === 'jp') return jpHtml(f.t ?? '', f.r ?? '', f.en ?? '', opts);
      throw new Error(`Unknown inline block "${f.blockType}"`);
    }
    default:
      throw new Error(`Unsupported inline Lexical node "${node.type}"`);
  }
}

/**
 * `本免許 (honmenkyo)` with the English gloss as a tooltip. The reading is always visible (Romaji rule). Screen
 * readers get the gloss as hidden text, so the tooltip itself is `aria-hidden`. The tooltip is `display:none` until
 * shown: an invisible absolutely positioned box would still widen the page on phones.
 */
function jpHtml(t: string, r: string, gloss: string, opts: InlineOptions): string {
  if (opts.feed) return `<span lang="ja">${escapeHtml(t)}</span> (${escapeHtml(r)}, ${escapeHtml(gloss)})`;
  return (
    `<span class="jp" tabindex="0">` +
    `<span lang="ja">${escapeHtml(t)}</span> <span class="jp-r">(${escapeHtml(r)})</span>` +
    `<span class="visually-hidden"> — ${escapeHtml(gloss)}</span>` +
    `<span class="jp-tip" aria-hidden="true">${escapeHtml(gloss)}</span></span>`
  );
}
