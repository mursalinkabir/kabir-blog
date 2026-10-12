/**
 * The agent's writing format: Markdown (CommonMark + GFM tables, task lists, strikethrough) plus four extensions,
 * converted to exactly the Lexical nodes the site's renderer accepts (apps/site/src/lib/lexical). Anything the
 * renderer cannot show is refused here, with a message the agent can act on, instead of failing the site build later.
 *
 *   :::note Optional title        callout; kinds: note | warn | danger. Body: paragraphs, lists, links.
 *   Body text...
 *   :::
 *
 *   ```terminal                   terminal block: command, a line containing only ---, then the output
 *   pnpm build
 *   ---
 *   done
 *   ```
 *
 *   ```d2 alt="what it shows"     diagram (d2, or mermaid shown as source); ```ts src/lib/x.ts {2,4-6} is code
 *
 *   {{日本語|nihongo|meaning}}      inline Japanese term: written form, Romaji reading, short meaning
 *
 *   ![](media:42 "Caption")       figure from an uploaded media document (upload_image gives the id)
 *
 *   [[keep:abc123]]               (only produced by get_post) puts back a block this format cannot express
 *
 * Refused on purpose: raw HTML, remote images, javascript: links, h1 inside the body (becomes h2).
 */
import { randomBytes } from 'node:crypto';
import { Lexer, type Token, type Tokens } from 'marked';

export class MarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkdownError';
  }
}

export type LexicalNode = { type: string; [key: string]: unknown };
export interface LexicalRoot {
  root: LexicalNode & { type: 'root'; children: LexicalNode[] };
}

const FORMAT = { bold: 1, italic: 2, strike: 4, underline: 8, code: 16 } as const;

const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  node: 'js',
  shell: 'sh',
  zsh: 'sh',
  console: 'sh',
  yml: 'yaml',
  py: 'python',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  md: 'text',
  plaintext: 'text',
  txt: 'text',
  '': 'text',
};
export const CODE_LANGUAGES = new Set([
  'text',
  'bash',
  'sh',
  'ts',
  'tsx',
  'js',
  'json',
  'yaml',
  'toml',
  'html',
  'css',
  'astro',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'sql',
  'diff',
  'dockerfile',
  'nginx',
]);

const id = () => randomBytes(8).toString('hex');
const base = { direction: 'ltr', format: '', indent: 0, version: 1 } as const;

const textNode = (text: string, format = 0): LexicalNode => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});
const paragraph = (children: LexicalNode[]): LexicalNode => ({ ...base, children, type: 'paragraph' });
const block = (fields: Record<string, unknown>): LexicalNode => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id: id(), blockName: '', ...fields },
});

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;
const JP_INLINE = /\{\{([^|{}\n]+)\|([^|{}\n]+)\|([^{}\n]+)\}\}/g;

// ---------------------------------------------------------------- Markdown -> Lexical

export interface ToLexicalOptions {
  /** Blocks from the document being edited, by id, for `[[keep:id]]` placeholders. */
  preserved?: Map<string, LexicalNode>;
  /** Callout bodies are written in a smaller dialect; this is set while converting one. */
  inCallout?: boolean;
}

function inlineNodes(tokens: Token[] | undefined, format: number, out: LexicalNode[] = []): LexicalNode[] {
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
      case 'escape': {
        const tok = t as Tokens.Text;
        if (tok.tokens?.length) {
          inlineNodes(tok.tokens, format, out);
          break;
        }
        pushText(tok.text, format, out);
        break;
      }
      case 'strong':
        inlineNodes((t as Tokens.Strong).tokens, format | FORMAT.bold, out);
        break;
      case 'em':
        inlineNodes((t as Tokens.Em).tokens, format | FORMAT.italic, out);
        break;
      case 'del':
        inlineNodes((t as Tokens.Del).tokens, format | FORMAT.strike, out);
        break;
      case 'codespan':
        out.push(textNode(decodeEntities((t as Tokens.Codespan).text), format | FORMAT.code));
        break;
      case 'br':
        out.push({ type: 'linebreak', version: 1 });
        break;
      case 'link': {
        const link = t as Tokens.Link;
        if (!SAFE_URL.test(link.href)) {
          throw new MarkdownError(`Link "${link.href}" is not allowed. Use https://, mailto:, a path starting with /, or #anchor.`);
        }
        out.push({
          ...base,
          version: 3,
          type: 'link',
          fields: { linkType: 'custom', newTab: false, url: link.href },
          children: inlineNodes(link.tokens, format),
        });
        break;
      }
      case 'image':
        throw new MarkdownError(
          'An image must be alone in its own paragraph, as ![](media:ID "Caption"), where ID comes from upload_image.',
        );
      case 'html':
        throw new MarkdownError(`Raw HTML is not allowed (found "${String(t.raw).trim().slice(0, 40)}"). Use Markdown.`);
      default:
        pushText((t as { raw?: string }).raw ?? '', format, out);
    }
  }
  return out;
}

/** Plain text, with {{t|r|en}} turned into the inline Japanese-term block. */
function pushText(text: string, format: number, out: LexicalNode[]) {
  const value = decodeEntities(text);
  let last = 0;
  for (const m of value.matchAll(JP_INLINE)) {
    if (m.index! > last) out.push(textNode(value.slice(last, m.index), format));
    out.push({
      type: 'inlineBlock',
      version: 1,
      format: '',
      fields: { id: id(), blockName: '', blockType: 'jp', t: m[1]!.trim(), r: m[2]!.trim(), en: m[3]!.trim() },
    });
    last = m.index! + m[0].length;
  }
  if (last < value.length) out.push(textNode(value.slice(last), format));
}

const decodeEntities = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!);

function listNode(list: Tokens.List, opts: ToLexicalOptions): LexicalNode {
  const isTask = list.items.some((i) => i.task);
  const listType = isTask ? 'check' : list.ordered ? 'number' : 'bullet';
  const children: LexicalNode[] = [];
  let value = 1;
  for (const item of list.items) {
    const inline: LexicalNode[] = [];
    const nested: LexicalNode[] = [];
    for (const t of item.tokens) {
      if (t.type === 'text' || t.type === 'paragraph') inlineNodes((t as Tokens.Text).tokens ?? [t], 0, inline);
      else if (t.type === 'list') nested.push(listNode(t as Tokens.List, opts));
      else if (t.type === 'space' || t.type === 'checkbox')
        continue; // the box itself is item.task / item.checked
      else throw new MarkdownError(`A list item may contain text and nested lists only (found ${t.type}).`);
    }
    children.push({
      ...base,
      children: inline,
      type: 'listitem',
      value: value++,
      ...(isTask ? { checked: Boolean(item.checked) } : {}),
    });
    // Lexical keeps a nested list in its own list item, which the site folds back into the previous one.
    for (const n of nested) children.push({ ...base, children: [n], type: 'listitem', value: value++ });
  }
  return {
    ...base,
    children,
    type: 'list',
    listType,
    start: list.ordered ? Number(list.start) || 1 : 1,
    tag: list.ordered ? 'ol' : 'ul',
  };
}

function tableNode(t: Tokens.Table): LexicalNode {
  const cell = (c: Tokens.TableCell, header: boolean): LexicalNode => ({
    ...base,
    type: 'tablecell',
    headerState: header ? 1 : 0,
    colSpan: 1,
    rowSpan: 1,
    backgroundColor: null,
    children: [paragraph(inlineNodes(c.tokens, 0))],
  });
  const row = (cells: Tokens.TableCell[], header: boolean): LexicalNode => ({
    ...base,
    type: 'tablerow',
    children: cells.map((c) => cell(c, header)),
  });
  return { ...base, type: 'table', children: [row(t.header, true), ...t.rows.map((r) => row(r, false))] };
}

function codeBlock(t: Tokens.Code): LexicalNode {
  const words = (t.lang ?? '').trim().split(/\s+/).filter(Boolean);
  const first = (words[0] ?? '').toLowerCase();
  const rest = words.slice(1).join(' ');
  if (first === 'terminal') {
    const parts = t.text.split(/\n---\n/);
    return block({
      blockType: 'terminal',
      command: parts[0]!.trimEnd(),
      ...(parts[1] ? { output: parts.slice(1).join('\n---\n').trimEnd() } : {}),
    });
  }
  if (first === 'd2' || first === 'mermaid') {
    const alt = /alt="([^"]*)"/.exec(rest)?.[1];
    return block({ blockType: 'diagram', kind: first, source: t.text.trimEnd(), ...(alt ? { alt } : {}) });
  }
  const language = LANGUAGE_ALIASES[first] ?? first;
  const highlight = /\{([\d,\-]+)\}/.exec(rest)?.[1];
  const filename = rest.replace(/\{[\d,\-]+\}/, '').trim();
  return block({
    blockType: 'code',
    language: CODE_LANGUAGES.has(language) ? language : 'text',
    code: t.text.replace(/\n$/, ''),
    ...(filename ? { filename } : {}),
    ...(highlight ? { highlightLines: highlight } : {}),
  });
}

/** Split out `:::kind` callouts (outside code fences); everything else is ordinary Markdown. */
function splitCallouts(md: string): ({ md: string } | { kind: string; title: string; body: string })[] {
  const parts: ({ md: string } | { kind: string; title: string; body: string })[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let buffer: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buffer.length) parts.push({ md: buffer.join('\n') });
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[2]![0]!;
      else if (fenceMatch[2]![0] === fence) fence = null;
    }
    const open = !fence && /^:::(note|warn|danger)\b[ \t]*(.*)$/.exec(line);
    if (open) {
      flush();
      const body: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (/^:::\s*$/.test(lines[i]!)) {
          closed = true;
          break;
        }
        body.push(lines[i]!);
      }
      if (!closed) throw new MarkdownError(`The :::${open[1]} callout is not closed. End it with a line containing only :::`);
      parts.push({ kind: open[1]!, title: open[2]!.trim(), body: body.join('\n') });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return parts;
}

export function markdownToLexical(markdown: string, opts: ToLexicalOptions = {}): LexicalRoot {
  const children: LexicalNode[] = [];
  for (const part of splitCallouts(markdown)) {
    if ('kind' in part) {
      if (opts.inCallout) throw new MarkdownError('Callouts cannot be nested.');
      const body = markdownToLexical(part.body, { ...opts, inCallout: true });
      if (!body.root.children.length) throw new MarkdownError('A callout needs some text inside it.');
      children.push(block({ blockType: 'callout', kind: part.kind, ...(part.title ? { title: part.title } : {}), body }));
      continue;
    }
    for (const t of new Lexer().lex(part.md)) {
      switch (t.type) {
        case 'space':
          break;
        case 'heading': {
          const h = t as Tokens.Heading;
          if (opts.inCallout) throw new MarkdownError('Headings are not allowed inside a callout.');
          const level = Math.min(Math.max(h.depth, 2), 4);
          children.push({ ...base, type: 'heading', tag: `h${level}`, children: inlineNodes(h.tokens, 0) });
          break;
        }
        case 'paragraph': {
          const p = t as Tokens.Paragraph;
          const only = p.tokens.length === 1 ? p.tokens[0]! : undefined;
          if (only?.type === 'image') {
            if (opts.inCallout) throw new MarkdownError('Images are not allowed inside a callout.');
            const img = only as Tokens.Image;
            const m = /^media:(\d+)$/.exec(img.href);
            if (!m)
              throw new MarkdownError(`Image "${img.href}" is not allowed. Upload it with upload_image and use ![](media:ID "Caption").`);
            children.push(block({ blockType: 'figure', media: Number(m[1]), ...(img.title ? { caption: img.title } : {}) }));
            break;
          }
          const keep = /^\[\[keep:([A-Za-z0-9_-]+)\]\]$/.exec(p.text.trim());
          if (keep) {
            const node = opts.preserved?.get(keep[1]!);
            if (!node) throw new MarkdownError(`[[keep:${keep[1]}]] refers to a block that is not in this post.`);
            children.push(node);
            break;
          }
          children.push(paragraph(inlineNodes(p.tokens, 0)));
          break;
        }
        case 'list':
          children.push(listNode(t as Tokens.List, opts));
          break;
        case 'blockquote': {
          const q = t as Tokens.Blockquote;
          const inline: LexicalNode[] = [];
          for (const inner of q.tokens) {
            if (inner.type === 'paragraph') {
              if (inline.length) inline.push({ type: 'linebreak', version: 1 });
              inlineNodes((inner as Tokens.Paragraph).tokens, 0, inline);
            } else if (inner.type !== 'space') throw new MarkdownError('A quote may contain paragraphs only.');
          }
          children.push({ ...base, type: 'quote', children: inline });
          break;
        }
        case 'code':
          if (opts.inCallout) throw new MarkdownError('Code blocks are not allowed inside a callout.');
          children.push(codeBlock(t as Tokens.Code));
          break;
        case 'table':
          if (opts.inCallout) throw new MarkdownError('Tables are not allowed inside a callout.');
          children.push(tableNode(t as Tokens.Table));
          break;
        case 'hr':
          children.push({ type: 'horizontalrule', version: 1 });
          break;
        case 'html':
          throw new MarkdownError(`Raw HTML is not allowed (found "${String(t.raw).trim().slice(0, 40)}"). Use Markdown.`);
        default:
          throw new MarkdownError(`Unsupported Markdown element: ${t.type}`);
      }
    }
  }
  return { root: { ...base, type: 'root', children } as LexicalRoot['root'] };
}

// ---------------------------------------------------------------- Lexical -> Markdown

const esc = (s: string) => s.replace(/([\\`*_{}[\]<>|~])/g, '\\$1').replace(/^(#{1,6} |[-+] |\d+\. |> )/, '\\$1');

function inlineToMd(nodes: LexicalNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') {
        const f = Number(n.format) || 0;
        let s = String(n.text);
        if (f & FORMAT.code) return '`' + s.replace(/`/g, '\\`') + '`';
        s = esc(s);
        if (f & FORMAT.bold) s = `**${s}**`;
        if (f & FORMAT.italic) s = `*${s}*`;
        if (f & FORMAT.strike) s = `~~${s}~~`;
        return s;
      }
      if (n.type === 'linebreak') return '  \n';
      if (n.type === 'link') return `[${inlineToMd(n.children as LexicalNode[])}](${(n.fields as { url: string }).url})`;
      if (n.type === 'inlineBlock') {
        const f = n.fields as { t: string; r: string; en: string };
        return `{{${f.t}|${f.r}|${f.en}}}`;
      }
      return inlineToMd((n.children as LexicalNode[]) ?? []);
    })
    .join('');
}

const mediaId = (m: unknown): string => String(typeof m === 'object' && m !== null ? (m as { id: unknown }).id : m);
const fence = (s: string) => (s.includes('```') ? '~~~~' : '```');

function listToMd(list: LexicalNode, depth = 0): string {
  const kids = (list.children as LexicalNode[]) ?? [];
  const out: string[] = [];
  const pad = '  '.repeat(depth);
  let n = Number(list.start) || 1;
  for (const li of kids) {
    const sub = ((li.children as LexicalNode[]) ?? []).filter((c) => c.type === 'list');
    if (sub.length && !((li.children as LexicalNode[]) ?? []).some((c) => c.type !== 'list')) {
      for (const s of sub) out.push(listToMd(s, depth + 1));
      continue;
    }
    const marker = list.listType === 'number' ? `${n++}.` : list.listType === 'check' ? `- [${li.checked ? 'x' : ' '}]` : '-';
    out.push(`${pad}${marker} ${inlineToMd(li.children as LexicalNode[])}`);
  }
  return out.join('\n');
}

function blockToMd(n: LexicalNode): string {
  switch (n.type) {
    case 'paragraph':
      return inlineToMd(n.children as LexicalNode[]);
    case 'heading':
      return `${'#'.repeat(Number(String(n.tag).slice(1)) || 2)} ${inlineToMd(n.children as LexicalNode[])}`;
    case 'list':
      return listToMd(n);
    case 'quote':
      return inlineToMd(n.children as LexicalNode[])
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'horizontalrule':
      return '---';
    case 'table': {
      const rows = (n.children as LexicalNode[]).map((r) =>
        (r.children as LexicalNode[]).map((c) =>
          inlineToMd(((c.children as LexicalNode[])[0]?.children as LexicalNode[]) ?? []).replace(/\|/g, '\\|'),
        ),
      );
      if (!rows.length) return '';
      const width = rows[0]!.length;
      const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
      return [line(rows[0]!), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
    }
    case 'block': {
      const f = n.fields as Record<string, unknown>;
      switch (f.blockType) {
        case 'code': {
          const code = String(f.code ?? '');
          const info = [f.language, f.filename, f.highlightLines ? `{${f.highlightLines}}` : ''].filter(Boolean).join(' ');
          return `${fence(code)}${info}\n${code}\n${fence(code)}`;
        }
        case 'terminal': {
          const body = f.output ? `${f.command}\n---\n${f.output}` : String(f.command ?? '');
          return `${fence(body)}terminal\n${body}\n${fence(body)}`;
        }
        case 'diagram': {
          const src = String(f.source ?? '');
          return `${fence(src)}${f.kind}${f.alt ? ` alt="${String(f.alt).replace(/"/g, "'")}"` : ''}\n${src}\n${fence(src)}`;
        }
        case 'callout': {
          const body = markdownFromLexical(f.body as LexicalRoot);
          return `:::${f.kind}${f.title ? ` ${f.title}` : ''}\n${body}\n:::`;
        }
        case 'figure':
          return `![](media:${mediaId(f.media)}${f.caption ? ` "${String(f.caption).replace(/"/g, "'")}"` : ''})`;
        default:
          // gallery-strip, html-embed, anything newer: kept as-is by id, never expressed in Markdown.
          return `[[keep:${String(f.id)}]]`;
      }
    }
    default:
      return inlineToMd((n.children as LexicalNode[]) ?? []);
  }
}

export function markdownFromLexical(doc: LexicalRoot | null | undefined): string {
  return (doc?.root?.children ?? [])
    .map(blockToMd)
    .filter((s) => s !== '')
    .join('\n\n');
}

/** Blocks the Markdown dialect cannot express, by id, to pass back as `preserved` when saving an edit. */
export function preservedBlocks(doc: LexicalRoot | null | undefined): Map<string, LexicalNode> {
  const map = new Map<string, LexicalNode>();
  for (const n of doc?.root?.children ?? []) {
    if (n.type !== 'block') continue;
    const f = n.fields as { blockType?: string; id?: string };
    if (!['code', 'terminal', 'diagram', 'callout', 'figure'].includes(String(f.blockType)) && f.id) map.set(f.id, n);
  }
  return map;
}

/** Every block of a type anywhere in a document, including inside callouts. */
export function findBlocks(doc: LexicalRoot | null | undefined, blockType: string): LexicalNode[] {
  const found: LexicalNode[] = [];
  const visit = (n: LexicalNode) => {
    if (Array.isArray(n.children)) (n.children as LexicalNode[]).forEach(visit);
    if (n.type === 'block') {
      const f = n.fields as { blockType?: string; body?: LexicalRoot };
      if (f.blockType === blockType) found.push(n);
      if (f.body?.root) f.body.root.children.forEach(visit);
    }
  };
  doc?.root?.children?.forEach(visit);
  return found;
}

/** Visible text of a document (for length and privacy checks). */
export function plainText(doc: LexicalRoot | null | undefined): string {
  const out: string[] = [];
  const visit = (n: LexicalNode) => {
    if (n.type === 'text') out.push(String(n.text));
    if (Array.isArray(n.children)) (n.children as LexicalNode[]).forEach(visit);
    if (n.type === 'inlineBlock') {
      const f = n.fields as { t?: string; r?: string; en?: string };
      out.push([f.t, f.r, f.en].filter(Boolean).join(' '));
    }
    if (n.type === 'block') {
      const f = n.fields as Record<string, unknown>;
      for (const k of ['title', 'caption', 'command', 'output', 'code', 'alt']) if (typeof f[k] === 'string') out.push(f[k] as string);
      const body = f.body as LexicalRoot | undefined;
      if (body?.root) body.root.children.forEach(visit);
    }
    out.push(' ');
  };
  doc?.root?.children?.forEach(visit);
  return out.join('').replace(/\s+/g, ' ').trim();
}
