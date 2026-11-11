// Rich text is rendered by synchronous React components; everything that needs I/O (code highlighting, diagrams) is done
// here first, once per document, and looked up by node. That keeps the components testable with renderToStaticMarkup.
import type { LexicalNode, LexicalRoot } from '../lib/lexical/types';
import { isText } from '../lib/lexical/types';
import { renderCodeHtml } from './code';
import { renderD2 } from './diagram';

export interface PreparedBlock {
  /** A rendered code frame (code and terminal blocks, and diagram fallbacks). */
  html?: string;
  /** A rendered diagram as a data URI. */
  svg?: string;
}
export interface Prepared {
  blocks: WeakMap<object, PreparedBlock>;
  /** The page needs the code stylesheet and script. */
  usesCode: boolean;
}

type Fields = Record<string, any>;

export async function prepareRichText(docs: (LexicalRoot | undefined)[], into?: Prepared): Promise<Prepared> {
  const out: Prepared = into ?? { blocks: new WeakMap(), usesCode: false };
  const jobs: Promise<void>[] = [];
  const visit = (n: LexicalNode) => {
    if (isText(n)) return;
    for (const c of n.children ?? []) visit(c);
    if (n.type !== 'block') return;
    const f = (n.fields ?? {}) as Fields;
    if (f.blockType === 'code') {
      out.usesCode = true;
      jobs.push(
        renderCodeHtml({ code: f.code ?? '', language: f.language, title: f.filename, mark: f.highlightLines }).then((html) => {
          out.blocks.set(n, { html });
        }),
      );
    } else if (f.blockType === 'terminal') {
      out.usesCode = true;
      jobs.push(
        renderCodeHtml({ code: f.command ?? '', language: 'bash', frame: 'terminal' }).then((html) => void out.blocks.set(n, { html })),
      );
    } else if (f.blockType === 'diagram') {
      jobs.push(
        (async () => {
          const svg = f.kind === 'd2' ? await renderD2(String(f.source ?? '')) : null;
          if (svg) return void out.blocks.set(n, { svg });
          out.usesCode = true;
          const html = await renderCodeHtml({
            code: String(f.source ?? ''),
            language: f.kind === 'd2' ? 'text' : 'mermaid',
            title: `${f.kind} diagram`,
          });
          out.blocks.set(n, { html });
        })(),
      );
    } else if (f.blockType === 'callout' && f.body?.root) {
      for (const c of f.body.root.children as LexicalNode[]) visit(c);
    }
  };
  for (const doc of docs) for (const n of doc?.root.children ?? []) visit(n);
  await Promise.all(jobs);
  return out;
}
