// Plain-HTML serializer for full-content RSS. Blocks degrade to semantic elements; the site renders the rich versions.
import type { LexicalNode, LexicalRoot } from './types';
import { isText } from './types';
import { escapeHtml, inlineToHtml, safeUrl } from './inline';
import { headingId, listItems } from './walk';
import type { Locale } from '~/i18n';
import { publicUrl } from '../media';

const abs = (url: string, origin: string) => (url.startsWith('/') ? new URL(url, origin).toString() : url);

export function lexicalToFeedHtml(doc: LexicalRoot, origin: string, locale: Locale): string {
  const inline = (nodes?: LexicalNode[]) => inlineToHtml(nodes, { feed: true, origin });

  const block = (node: LexicalNode): string => {
    if (isText(node)) return inline([node]);
    const kids = node.children ?? [];
    switch (node.type) {
      case 'paragraph':
        return `<p>${inline(kids)}</p>`;
      case 'heading': {
        // Same rule as the site: h2 to h4 only.
        const tag = /^h[2-4]$/.test(String(node.tag)) ? String(node.tag) : 'h2';
        const id = headingId(node);
        return `<${tag}${id ? ` id="${escapeHtml(id)}"` : ''}>${inline(kids)}</${tag}>`;
      }
      case 'list': {
        const tag = node.listType === 'number' ? 'ol' : 'ul';
        const items = listItems(node).map((i) => {
          const mark = i.checked === undefined ? '' : i.checked ? '[x] ' : '[ ] ';
          return `<li>${mark}${inline(i.inline)}${i.nested.map(block).join('')}</li>`;
        });
        return `<${tag}>${items.join('')}</${tag}>`;
      }
      case 'quote':
        return `<blockquote>${inline(kids)}</blockquote>`;
      case 'horizontalrule':
        return '<hr>';
      case 'table':
        return `<table>${kids.map(block).join('')}</table>`;
      case 'tablerow':
        return `<tr>${kids.map(block).join('')}</tr>`;
      case 'tablecell': {
        const tag = Number(node.headerState) > 0 ? 'th' : 'td';
        return `<${tag}>${kids.map((c) => inline((c as { children?: LexicalNode[] }).children)).join(' ')}</${tag}>`;
      }
      case 'block':
        return blockFields((node.fields ?? {}) as Record<string, any>);
      default:
        throw new Error(`Unsupported block Lexical node "${node.type}"`);
    }
  };

  const img = (m: any) => {
    const src = abs(safeUrl(publicUrl(m)), origin);
    const alt = m.alt?.[locale] ?? '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${m.width}" height="${m.height}">`;
  };

  const blockFields = (f: Record<string, any>): string => {
    switch (f.blockType) {
      case 'code':
        return `<pre><code>${escapeHtml(String(f.code ?? ''))}</code></pre>`;
      case 'terminal':
        return `<pre><code>$ ${escapeHtml(String(f.command ?? ''))}\n${escapeHtml(String(f.output ?? ''))}</code></pre>`;
      case 'callout':
        return `<blockquote>${lexicalToFeedHtml(f.body as LexicalRoot, origin, locale)}</blockquote>`;
      case 'figure':
        return `<figure>${img(f.media)}${f.caption ? `<figcaption>${escapeHtml(f.caption)}</figcaption>` : ''}</figure>`;
      case 'gallery-strip':
        return `<p>${(f.media as any[]).map(img).join(' ')}</p>`;
      case 'diagram':
        return '<p><em>(Diagram: view it on the website.)</em></p>';
      default:
        throw new Error(`Unknown block "${f.blockType}"`);
    }
  };

  return doc.root.children.map(block).join('\n');
}
