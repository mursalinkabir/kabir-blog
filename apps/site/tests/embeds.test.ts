import { describe, expect, it } from 'vitest';
import { collectEmbeds, embedDocument, embedId, embedPath, embedsIn, MAX_EMBED_BYTES } from '~/lib/embeds';
import type { LexicalRoot } from '~/lib/lexical/types';

const doc = (...children: unknown[]) => ({ root: { type: 'root', children } }) as unknown as LexicalRoot;
const embed = (html: string, title = 'T') => ({ type: 'block', fields: { blockType: 'html-embed', html, title } });

describe('embed ids', () => {
  it('are the content hash: stable, and different when the HTML differs', () => {
    expect(embedId('<p>a</p>')).toBe(embedId('<p>a</p>'));
    expect(embedId('<p>a</p>')).not.toBe(embedId('<p>b</p>'));
    expect(embedId('x')).toMatch(/^[0-9a-f]{24}$/);
    expect(embedPath('x')).toBe(`/embeds/${embedId('x')}.html`);
  });
});

describe('embedDocument()', () => {
  it('wraps a fragment in a document, escaping the title', () => {
    const out = embedDocument('<p>hi</p><script>1</script>', 'A <b> & C', 'en');
    expect(out.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(out).toContain('<title>A &lt;b&gt; &amp; C</title>');
    expect(out).toContain('<p>hi</p><script>1</script>');
  });

  it('keeps a full document as written and adds noindex and the height reporter', () => {
    const src = '<!doctype html><html lang="ja"><head><title>x</title></head><body class="a"><main>m</main></body></html>';
    const out = embedDocument(src, 'x', 'en');
    expect(out).toContain('<html lang="ja">');
    expect(out).toContain('<head><meta name="robots" content="noindex, nofollow"><title>x</title></head>');
    expect(out).toContain('<main>m</main>');
    expect(out.indexOf('kabir-embed-height')).toBeGreaterThan(out.indexOf('<main>'));
    expect(out.indexOf('kabir-embed-height')).toBeLessThan(out.indexOf('</body>'));
  });

  it('handles a document with no head and no closing body', () => {
    const out = embedDocument('<!doctype html><html><p>bare', 't', 'en');
    expect(out).toContain('<head><meta name="robots" content="noindex, nofollow"></head>');
    expect(out.endsWith('</script>')).toBe(true);
  });

  it('the height reporter sends one number to the parent and nothing else', () => {
    const out = embedDocument('<p>x</p>', 't', 'en');
    const script = /<script>(\(function\(\)\{function m[\s\S]*?)<\/script>/.exec(out)?.[1] ?? '';
    expect(script).toContain('parent.postMessage');
    expect(script).not.toMatch(/fetch|XMLHttpRequest|localStorage|document\.cookie|eval\(/);
    expect(script.match(/postMessage/g)).toHaveLength(1);
  });

  it('refuses an oversize embed instead of publishing it', () => {
    expect(() => embedDocument('x'.repeat(MAX_EMBED_BYTES + 1), 'big', 'en')).toThrow(/larger than/);
  });
});

describe('embedsIn()', () => {
  it('finds top-level embeds and embeds inside a callout body', () => {
    const inner = doc(embed('<i>inner</i>', 'Inner'));
    const root = doc({ type: 'paragraph', children: [] }, embed('<b>top</b>', 'Top'), {
      type: 'block',
      fields: { blockType: 'callout', body: inner },
    });
    const found = embedsIn(root, 'en');
    expect(found.map((e) => e.title)).toEqual(['Top', 'Inner']);
    expect(found[0]!.id).toBe(embedId('<b>top</b>'));
  });

  it('ignores other blocks and an embed with no html', () => {
    expect(
      embedsIn(
        doc({ type: 'block', fields: { blockType: 'code', code: 'x' } }, { type: 'block', fields: { blockType: 'html-embed' } }),
        'en',
      ),
    ).toEqual([]);
  });
});

describe('collectEmbeds() on the fixtures', () => {
  const found = collectEmbeds();
  it('includes the embed of a published post', () => {
    expect(found.some((e) => e.title === 'A line that grows with each button press')).toBe(true);
  });
  it('never includes the embed of a draft', () => {
    expect(found.some((e) => e.html.includes('DRAFT-ONLY-MARKER'))).toBe(false);
  });
  it('lists each distinct embed once', () => {
    expect(new Set(found.map((e) => e.id)).size).toBe(found.length);
  });
});
