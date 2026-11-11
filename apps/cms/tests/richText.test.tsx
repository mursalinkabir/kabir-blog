import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichText } from '../src/site/views/rich/RichText';
import { prepareRichText } from '../src/site/render/prepare';
import { BLOCK_SLUGS, INLINE_BLOCK_SLUGS } from '../src/blocks';
import type { LexicalRoot } from '../src/site/lib/lexical/types';

const text = (t: string) => ({ type: 'text' as const, text: t, format: 0 });
const P = (t: string) => ({ type: 'paragraph', children: [text(t)] });
const H = (tag: string, t: string) => ({ type: 'heading', tag, children: [text(t)] });
const BLOCK = (blockType: string, fields: Record<string, unknown> = {}) => ({ type: 'block', fields: { blockType, ...fields } });
const doc = (...children: unknown[]) => ({ root: { type: 'root', children } }) as unknown as LexicalRoot;
const html = async (d: LexicalRoot) => renderToStaticMarkup(<RichText doc={d} locale="en" prepared={await prepareRichText([d])} />);

describe('RichText', () => {
  it('escapes text', async () => expect(await html(doc(P('<script>x</script>')))).toContain('&lt;script&gt;'));

  it('renders h2-h4 with an id and an anchor', async () =>
    expect(await html(doc(H('h2', 'Setup')))).toBe(
      '<h2 id="setup">Setup<a class="anchor" href="#setup" aria-hidden="true" tabindex="-1">#</a></h2>',
    ));

  it('renders a checklist with hidden done/todo labels', async () => {
    const list = {
      type: 'list',
      listType: 'check',
      children: [
        { type: 'listitem', checked: true, children: [text('a')] },
        { type: 'listitem', checked: false, children: [text('b')] },
      ],
    };
    const out = await html(doc(list));
    expect(out).toContain('class="checklist"');
    expect(out).toContain('class="check-mark"');
    expect(out).toContain('class="visually-hidden"');
  });

  it('throws on an unknown node type', async () => {
    await expect(html(doc({ type: 'marquee' }))).rejects.toThrow(/marquee/);
  });
  it('throws on an unknown block', async () => {
    await expect(html(doc(BLOCK('nope')))).rejects.toThrow(/nope/);
  });

  it('has a renderer for every block the CMS defines', () => {
    expect([...BLOCK_SLUGS].sort()).toEqual(['callout', 'code', 'diagram', 'figure', 'gallery-strip', 'html-embed', 'terminal']);
    expect(INLINE_BLOCK_SLUGS).toEqual(['jp']);
  });

  it('frames an html-embed with sandbox="allow-scripts" and nothing more', async () => {
    const out = await html(doc(BLOCK('html-embed', { html: '<script>1</script>', title: 'T' })));
    expect(out).toMatch(/<iframe[^>]+src="\/embeds\/[0-9a-f]+\.html"/);
    expect(out).toContain('sandbox="allow-scripts"');
    expect(out).not.toContain('allow-same-origin');
    expect(out).not.toContain('<script>1</script>');
  });

  it('highlights a code block and marks lines, with no inline style or script', async () => {
    const out = await html(doc(BLOCK('code', { code: 'const a = 1;\nconst b = 2;', language: 'ts', highlightLines: '2' })));
    expect(out).toContain('class="expressive-code"');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('<script');
  });
  it('escapes code, in the markup and in the copy-button attribute', async () => {
    const out = await html(doc(BLOCK('code', { code: '</pre><script>x</script> " onload="y', language: 'html' })));
    // The copy button keeps the source in a quoted attribute, where markup is inert; every quote in it must be escaped.
    const outsideAttributes = out.replace(/ data-code="[^"]*"/g, '');
    expect(outsideAttributes).not.toContain('<script');
    expect(out).toMatch(/data-code="[^"]*"/);
    expect(out).not.toMatch(/data-code="[^"]*"[^>]* onload="y/);
  });
  it('renders a terminal block with its output', async () => {
    const out = await html(doc(BLOCK('terminal', { command: 'echo hi', output: 'hi <b>' })));
    expect(out).toContain('class="terminal"');
    expect(out).toContain('hi &lt;b&gt;');
  });
  it('shows a diagram source when it cannot be rendered', async () => {
    const out = await html(doc(BLOCK('diagram', { kind: 'mermaid', source: 'graph TD; A-->B', alt: 'x' })));
    expect(out).toContain('expressive-code');
  });
});
