import { describe, expect, it } from 'vitest';
import {
  findBlocks,
  markdownFromLexical,
  markdownToLexical,
  MarkdownError,
  plainText,
  preservedBlocks,
  type LexicalNode,
  type LexicalRoot,
} from '../src/lib/markdown';

const kids = (md: string, opts = {}) => markdownToLexical(md, opts).root.children;
const fields = (n: LexicalNode) => n.fields as Record<string, any>;

describe('Markdown -> Lexical: the nodes the renderer expects', () => {
  it('paragraphs with bold, italic, strike and code become format flags', () => {
    const [p] = kids('A **bold *and italic*** ~~gone~~ `code`.');
    const texts = (p!.children as LexicalNode[]).map((t) => [t.text, t.format]);
    expect(texts).toEqual([
      ['A ', 0],
      ['bold ', 1],
      ['and italic', 3],
      [' ', 0],
      ['gone', 4],
      [' ', 0],
      ['code', 16],
      ['.', 0],
    ]);
  });

  it('headings: h1 becomes h2, h5 becomes h4', () => {
    expect(kids('# T\n\n## A\n\n##### B').map((n) => n.tag)).toEqual(['h2', 'h2', 'h4']);
  });

  it('lists: bullet, numbered, check, and nesting in its own list item as Lexical does', () => {
    const [bullet, num, check] = kids('- a\n  - b\n- c\n\n3. x\n4. y\n\n- [x] done\n- [ ] todo');
    expect(bullet).toMatchObject({ type: 'list', listType: 'bullet', tag: 'ul' });
    const items = bullet!.children as LexicalNode[];
    expect(items.map((i) => (i.children as LexicalNode[])[0]!.type)).toEqual(['text', 'list', 'text']);
    expect(items.map((i) => i.value)).toEqual([1, 2, 3]);
    expect(num).toMatchObject({ listType: 'number', tag: 'ol', start: 3 });
    expect(check).toMatchObject({ listType: 'check' });
    expect((check!.children as LexicalNode[]).map((i) => i.checked)).toEqual([true, false]);
  });

  it('links keep a safe URL and refuse unsafe ones', () => {
    const [p] = kids('See [the docs](https://example.org/x) and [contact](/contact/).');
    const links = (p!.children as LexicalNode[]).filter((c) => c.type === 'link');
    expect(links.map((l) => fields(l).url)).toEqual(['https://example.org/x', '/contact/']);
    expect(fields(links[0]!)).toMatchObject({ linkType: 'custom', newTab: false });
    expect(() => kids('[x](javascript:alert(1))')).toThrow(MarkdownError);
    expect(() => kids('[x](data:text/html;base64,AAAA)')).toThrow(/not allowed/);
  });

  it('a fenced code block becomes a code block with language, filename and highlight lines', () => {
    const [b] = kids('```typescript src/lib/x.ts {2,4-6}\nconst a = 1;\n```');
    expect(fields(b!)).toMatchObject({
      blockType: 'code',
      language: 'ts',
      filename: 'src/lib/x.ts',
      highlightLines: '2,4-6',
      code: 'const a = 1;',
    });
  });

  it('an unknown language falls back to text instead of failing the build', () => {
    expect(fields(kids('```cobol\nx\n```')[0]!).language).toBe('text');
  });

  it('terminal, diagram and callout extensions', () => {
    const nodes = kids(
      '```terminal\npnpm build\n---\ndone\n```\n\n```d2 alt="two boxes"\na -> b\n```\n\n:::warn Careful\nCheck the **plate**.\n:::',
    );
    expect(fields(nodes[0]!)).toMatchObject({ blockType: 'terminal', command: 'pnpm build', output: 'done' });
    expect(fields(nodes[1]!)).toMatchObject({ blockType: 'diagram', kind: 'd2', source: 'a -> b', alt: 'two boxes' });
    const callout = fields(nodes[2]!);
    expect(callout).toMatchObject({ blockType: 'callout', kind: 'warn', title: 'Careful' });
    expect(callout.body.root.children).toHaveLength(1);
  });

  it('a callout marker inside a code fence is just code', () => {
    const nodes = kids('```md\n:::note\nnot a callout\n:::\n```');
    expect(nodes).toHaveLength(1);
    expect(fields(nodes[0]!).blockType).toBe('code');
  });

  it('inline Japanese terms become the jp inline block', () => {
    const [p] = kids('The word {{本免許|honmenkyo|full licence}} appears.');
    const jp = (p!.children as LexicalNode[]).find((c) => c.type === 'inlineBlock')!;
    expect(fields(jp)).toMatchObject({ blockType: 'jp', t: '本免許', r: 'honmenkyo', en: 'full licence' });
  });

  it('a lone image must be an uploaded media id; remote images are refused', () => {
    const [f] = kids('![](media:42 "A caption")');
    expect(fields(f!)).toMatchObject({ blockType: 'figure', media: 42, caption: 'A caption' });
    expect(() => kids('![x](https://evil.example/a.png)')).toThrow(/upload_image/);
    expect(() => kids('text ![x](media:1) inline')).toThrow(/own paragraph/);
  });

  it('tables: header row then body rows with the cell shape the renderer reads', () => {
    const [t] = kids('| Item | Cost |\n| --- | ---: |\n| Power | 1,320 |');
    expect(t!.type).toBe('table');
    const rows = t!.children as LexicalNode[];
    expect(rows).toHaveLength(2);
    expect((rows[0]!.children as LexicalNode[])[0]).toMatchObject({ type: 'tablecell', headerState: 1 });
    expect((rows[1]!.children as LexicalNode[])[1]).toMatchObject({ type: 'tablecell', headerState: 0 });
  });

  it('quotes and rules', () => {
    expect(kids('> one\n> two\n\n---').map((n) => n.type)).toEqual(['quote', 'horizontalrule']);
  });

  it('refuses raw HTML, anywhere', () => {
    expect(() => kids('<script>alert(1)</script>')).toThrow(/Raw HTML/);
    expect(() => kids('text <img src=x onerror=alert(1)> more')).toThrow(/Raw HTML/);
    expect(() => kids('<iframe src="https://x"></iframe>')).toThrow(MarkdownError);
  });

  it('an unclosed callout and a nested callout are errors with a clear message', () => {
    expect(() => kids(':::note\nno end')).toThrow(/not closed/);
    expect(() => kids(':::note\n:::warn\nx\n:::\n:::')).toThrow();
  });

  it('every produced node type is one the site renderer accepts', () => {
    const accepted = new Set([
      'root',
      'text',
      'paragraph',
      'heading',
      'list',
      'listitem',
      'quote',
      'horizontalrule',
      'block',
      'linebreak',
      'link',
      'inlineBlock',
      'table',
      'tablerow',
      'tablecell',
    ]);
    const md =
      '## H\n\ntext **b** `c` [l](/x) {{日|ni|day}}\n\n- a\n  - b\n\n> q\n\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```ts\nx\n```\n\n:::note\nhi\n:::\n\n![](media:1)';
    const seen = new Set<string>();
    const visit = (n: LexicalNode) => {
      seen.add(n.type);
      (n.children as LexicalNode[] | undefined)?.forEach(visit);
      const body = (n.fields as { body?: LexicalRoot } | undefined)?.body;
      body?.root.children.forEach(visit);
    };
    markdownToLexical(md).root.children.forEach(visit);
    for (const t of seen) expect(accepted.has(t), t).toBe(true);
  });
});

describe('Lexical -> Markdown and back (editing an existing post)', () => {
  const sample =
    '## Heading\n\nSome **bold** text, a [link](https://example.org) and {{日本語|nihongo|Japanese}}.\n\n' +
    '- one\n  - nested\n- two\n\n> a quote\n\n```ts src/a.ts\nconst a = 1;\n```\n\n```terminal\nls\n---\nfile\n```\n\n' +
    ':::note Hello\nInside.\n:::\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![](media:7 "Cap")';

  it('round-trips: Markdown -> Lexical -> Markdown -> Lexical is stable', () => {
    const first = markdownToLexical(sample);
    const md = markdownFromLexical(first);
    const second = markdownToLexical(md);
    const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' ? undefined : x)));
    expect(strip(second)).toEqual(strip(first));
  });

  it('blocks Markdown cannot express survive an edit through [[keep:id]]', () => {
    const doc = markdownToLexical('Intro.\n\nMore.');
    const gallery: LexicalNode = {
      type: 'block',
      version: 2,
      format: '',
      fields: { id: 'g1', blockName: '', blockType: 'gallery-strip', media: [1, 2] },
    };
    doc.root.children.splice(1, 0, gallery);
    const md = markdownFromLexical(doc);
    expect(md).toContain('[[keep:g1]]');
    const edited = md.replace('More.', 'More, edited.');
    const back = markdownToLexical(edited, { preserved: preservedBlocks(doc) });
    expect(findBlocks(back, 'gallery-strip')).toHaveLength(1);
    expect(plainText(back)).toContain('More, edited.');
  });

  it('a keep marker for an unknown block is an error, not a silent drop', () => {
    expect(() => markdownToLexical('[[keep:nope]]')).toThrow(/not in this post/);
  });
});

describe('plainText() and findBlocks()', () => {
  it('reads text, jp terms, callout bodies and captions; finds blocks inside callouts', () => {
    const doc = markdownToLexical('Hello {{日|ni|day}}\n\n:::note\nInside text\n:::\n\n```terminal\nls\n```');
    const text = plainText(doc);
    expect(text).toContain('Hello');
    expect(text).toContain('Inside text');
    expect(text).toContain('ls');
    expect(findBlocks(doc, 'callout')).toHaveLength(1);
  });
});
