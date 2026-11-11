import { IGNORED_ATTRIBUTES, ASSET_URL } from './parity-allow';

const TAG = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>|[^<]+|</g;
const VOID = new Set(['meta', 'link', 'img', 'br', 'hr', 'input', 'path', 'circle', 'rect', 'source', 'wbr', 'area', 'col', 'base']);

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const asset = (v: string) => ASSET_URL.reduce((acc, r) => acc.replace(r.match, r.replace), v);

function attrsOf(tag: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const inner = tag.replace(/^<\/?[a-zA-Z][^\s>/]*/, '').replace(/\/?>$/, '');
  for (const m of inner.matchAll(re)) out.push([m[1]!.toLowerCase(), decode(m[2] ?? m[3] ?? m[4] ?? '')]);
  return out;
}

/** A page body as comparable tokens. */
export function tokensOf(html: string): string[] {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const out: string[] = [];
  const skipUntil: string[] = [];
  const contentsDepth: number[] = []; // nesting depth of div/span display:contents wrappers
  let depth = 0;
  for (const raw of body.match(TAG) ?? []) {
    if (raw.startsWith('<!--')) continue;
    if (!raw.startsWith('<') || raw === '<') {
      if (skipUntil.length) continue;
      const text = decode(raw).replace(/\s+/g, ' ');
      if (text.trim()) out.push(`#${text.trim()}`);
      continue;
    }
    const closing = raw.startsWith('</');
    const name = /^<\/?([a-zA-Z0-9-]+)/.exec(raw)![1]!.toLowerCase();
    if (skipUntil.length) {
      if (closing && name === skipUntil[skipUntil.length - 1]) skipUntil.pop();
      continue;
    }
    if (!closing && (name === 'script' || name === 'style')) {
      if (!raw.endsWith('/>')) skipUntil.push(name);
      continue;
    }
    if (name === 'link') continue; // stylesheets and preloads that React hoists; <head> is compared separately
    if (name === 'div' || name === 'span') {
      if (!closing) {
        depth++;
        const a = attrsOf(raw);
        if (a.length === 1 && a[0]![0] === 'style' && a[0]![1].replace(/\s/g, '') === 'display:contents') {
          contentsDepth.push(depth);
          continue;
        }
        if (name === 'div') {
          /* fall through */
        }
      } else {
        if (contentsDepth.length && contentsDepth[contentsDepth.length - 1] === depth) {
          contentsDepth.pop();
          depth--;
          continue;
        }
        depth--;
      }
    }
    if (closing) {
      out.push(`</${name}>`);
      continue;
    }
    const all = attrsOf(raw);
    if (name === 'meta' && all.some(([k]) => k.startsWith('data-pagefind'))) continue;
    const attrs = all
      .filter(([k]) => !IGNORED_ATTRIBUTES.some((i) => i.name.test(k)))
      .map(([k, v]) => {
        if (k === 'class') return [k, v.split(/\s+/).filter(Boolean).sort().join(' ')] as [string, string];
        if (k === 'style') return [k, v.replace(/\s+/g, '').replace(/;$/, '')] as [string, string];
        if (k === 'href' || k === 'src' || k === 'srcset') return [k, asset(v)] as [string, string];
        return [k.replace(/^hreflang$/i, 'hreflang'), v] as [string, string];
      })
      .sort((a, b) => a[0].localeCompare(b[0]));
    out.push(`<${name}${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}>`);
    void VOID;
  }
  return out;
}

/** The meaning of the <head>: title, description, canonical, hreflang, feeds, icon, robots, Open Graph and Twitter tags, JSON-LD. */
export function headOf(html: string): string[] {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
  const out: string[] = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  if (title !== undefined) out.push(`title=${decode(title)}`);
  for (const raw of head.match(/<(meta|link)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi) ?? []) {
    const a = Object.fromEntries(attrsOf(raw));
    const name = /^<(\w+)/.exec(raw)![1]!.toLowerCase();
    if (name === 'meta') {
      const key = a.name ?? a.property;
      if (
        !key ||
        ['viewport', 'next-size-adjust', 'generator'].includes(key) ||
        key.startsWith('twitter:title') ||
        key.startsWith('twitter:description')
      )
        continue;
      out.push(`meta ${key}=${a.content ?? ''}${a.media ? ` @${a.media}` : ''}`);
    } else if (['canonical', 'alternate', 'icon'].includes(a.rel ?? '')) {
      out.push(`link ${a.rel} ${a.hreflang ?? ''} ${a.type ?? ''} ${a.title ?? ''} ${a.href ?? ''}`.replace(/\s+/g, ' '));
    }
  }
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g))
    out.push(`jsonld ${JSON.stringify(JSON.parse(decode(m[1]!)))}`);
  return out.sort();
}
