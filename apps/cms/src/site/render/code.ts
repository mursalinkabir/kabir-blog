// Syntax highlighting with Expressive Code, the same engine the Astro site used. The renderer is created once; rendered
// blocks are cached by content hash (capped). Per-block styles are not inlined: the base and theme styles ship once in
// /site/ec.css and the copy-button script in /site/ec.js (see scripts/build-site-assets.mjs).
import { createHash } from 'node:crypto';
import { createRenderer } from 'rehype-expressive-code';
import { toHtml } from 'rehype-expressive-code/hast';
import { ecOptions } from './ec-options';

export interface CodeInput {
  code: string;
  language?: string;
  title?: string;
  /** "4,6-8" */
  mark?: string;
  frame?: 'code' | 'terminal';
}

const MAX_CACHE = 500;
const cache = new Map<string, string>();
let renderer: ReturnType<typeof createRenderer> | undefined;
const get = () => (renderer ??= createRenderer(ecOptions as never));

/** The meta string Expressive Code reads: a title and the marked lines, e.g. `title="a.ts" {4,6-8}`. */
function metaOf(input: CodeInput): string {
  const lines = (input.mark ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
  return [input.title ? `title="${input.title.replace(/"/g, '')}"` : '', lines ? `{${lines}}` : ''].filter(Boolean).join(' ');
}

/** HTML of one code frame. It escapes the code itself; the result is safe to insert as trusted markup. */
export async function renderCodeHtml(input: CodeInput): Promise<string> {
  const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const { ec } = await get();
  const { renderedGroupAst } = await ec.render({
    code: input.code,
    language: input.language || 'text',
    meta: metaOf(input),
    props: input.frame === 'terminal' ? { frame: 'terminal' } : undefined,
  } as never);
  const out = toHtml(renderedGroupAst);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

/** The stylesheet and script every page with a code block needs. */
export async function codeAssets(): Promise<{ css: string; js: string }> {
  const { baseStyles, themeStyles, jsModules } = await get();
  return { css: `${baseStyles}\n${themeStyles}`, js: jsModules.join('\n') };
}
