import type { LexicalNode, LexicalRoot } from './types';
import { isText } from './types';

export interface Heading {
  id: string;
  text: string;
  depth: 2 | 3 | 4;
}

const ids = new WeakMap<object, string>();
const headingsOf = new WeakMap<object, Heading[]>();

const BLOCKISH = new Set([
  'paragraph',
  'heading',
  'listitem',
  'quote',
  'list',
  'block',
  'horizontalrule',
  'tablecell',
  'tablerow',
  'table',
]);

export function plainText(nodes: LexicalNode[] = []): string {
  let out = '';
  for (const n of nodes) {
    if (isText(n)) {
      out += n.text;
    } else if (n.type === 'linebreak') {
      out += ' ';
    } else if (n.type === 'inlineBlock') {
      const f = (n.fields ?? {}) as { t?: string; r?: string };
      out += `${f.t ?? ''} ${f.r ?? ''}`;
    } else if (n.type === 'block') {
      const f = (n.fields ?? {}) as { blockType?: string; body?: LexicalRoot; caption?: string };
      if (f.blockType === 'callout' && f.body) out += plainText(f.body.root.children);
      else if (f.blockType === 'figure') out += f.caption ?? '';
      out += '\n';
    } else {
      out += plainText(n.children);
      if (BLOCKISH.has(n.type)) out += '\n';
    }
  }
  return out;
}

/** Unicode-aware slug: keeps letters in any script (kana and kanji included) and combining marks (\p{M}). */
export function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** Ids the layout already uses; a heading with one of these titles gets a suffix so anchors never collide. */
const RESERVED_IDS = new Set(['main', 'search', 'toc-title', 'related-title', 'topics-title']);

/** Collect h2–h4 once per document and remember each heading node's id, so TOC and body always agree. */
export function headings(doc: LexicalRoot): Heading[] {
  const cached = headingsOf.get(doc);
  if (cached) return cached;
  const seen = new Map<string, number>();
  const out: Heading[] = [];
  for (const node of doc.root.children) {
    if (isText(node) || node.type !== 'heading') continue;
    const depth = Number(String(node.tag).slice(1));
    if (depth < 2 || depth > 4) continue;
    const text = plainText(node.children).trim();
    const slug = slugifyHeading(text);
    const base = RESERVED_IDS.has(slug) ? `${slug}-section` : slug;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    ids.set(node, id);
    out.push({ id, text, depth: depth as 2 | 3 | 4 });
  }
  headingsOf.set(doc, out);
  return out;
}

export const headingId = (node: object): string | undefined => ids.get(node);

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

/**
 * Reading time. Latin text is counted as whitespace-separated words (220 per minute); Japanese has no spaces, so
 * kana and kanji are counted as characters (500 per minute, the usual figure for Japanese readers).
 */
export function readingMinutes(doc: LexicalRoot): number {
  const text = plainText(doc.root.children);
  const cjk = (text.match(CJK) ?? []).length;
  const words = text.replace(CJK, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220 + cjk / 500));
}

/** True when an editor value has nothing in it: no text and no block, list, table or rule (an untouched editor). */
export function isEmptyDoc(doc: LexicalRoot): boolean {
  return doc.root.children.every((n) => !isText(n) && n.type === 'paragraph' && plainText([n]).trim() === '');
}

export interface ListEntry {
  /** Inline children of the item (text, links, inline blocks). */
  inline: LexicalNode[];
  /** Lists nested under this item. */
  nested: LexicalNode[];
  /** Checklist state, when the list is a checklist. */
  checked?: boolean;
}

/**
 * Items of a Lexical list. Lexical serialises a nested list as its own `listitem` whose only child is the list, so
 * that wrapper is folded into the previous item (otherwise it would render an empty bullet).
 */
export function listItems(list: LexicalNode): ListEntry[] {
  const out: ListEntry[] = [];
  for (const li of isText(list) ? [] : (list.children ?? [])) {
    const kids = isText(li) ? [] : (li.children ?? []);
    const isList = (n: LexicalNode) => !isText(n) && n.type === 'list';
    const onlyLists = kids.length > 0 && kids.every(isList);
    if (onlyLists && out.length > 0) {
      out[out.length - 1]!.nested.push(...kids);
      continue;
    }
    out.push({
      inline: kids.filter((n) => !isList(n)),
      nested: kids.filter(isList),
      checked: !isText(li) && typeof li.checked === 'boolean' ? li.checked : undefined,
    });
  }
  return out;
}
