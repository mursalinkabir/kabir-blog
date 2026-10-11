import { describe, expect, it } from 'vitest';
import { escapeHtml, inlineToHtml, safeUrl } from '~/lib/lexical/inline';
import { headings, isEmptyDoc, listItems, plainText, slugifyHeading } from '~/lib/lexical/walk';
import type { LexicalNode, LexicalRoot } from '~/lib/lexical/types';

const text = (t: string, format = 0): LexicalNode => ({ type: 'text', text: t, format });
const para = (...c: LexicalNode[]): LexicalNode => ({ type: 'paragraph', children: c });
const heading = (tag: string, t: string): LexicalNode => ({ type: 'heading', tag, children: [text(t)] });
const li = (...c: LexicalNode[]): LexicalNode => ({ type: 'listitem', children: c });
const list = (listType: 'bullet' | 'number' | 'check', ...c: LexicalNode[]): LexicalNode => ({ type: 'list', listType, children: c });
const doc = (...c: LexicalNode[]): LexicalRoot => ({ root: { type: 'root', children: c } });

describe('safeUrl', () => {
  it.each([
    ['/posts/x/', '/posts/x/'],
    ['#section', '#section'],
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['mailto:hello@smkabir.com', 'mailto:hello@smkabir.com'],
  ])('allows %s', (input, out) => expect(safeUrl(input)).toBe(out));

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>1</script>',
    '//evil.example',
    '/\\evil.example', // browsers read this as //evil.example
    '/\t/evil.example',
    'vbscript:x',
    undefined,
    42,
  ])('rejects %j', (input) => expect(safeUrl(input)).toBe('#'));
});

describe('inlineToHtml', () => {
  it('escapes text and attributes', () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
    const html = inlineToHtml([{ type: 'link', fields: { url: 'https://e.com/?a="b"' }, children: [text('<b>')] }]);
    expect(html).toContain('href="https://e.com/?a=&quot;b&quot;"');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('opens external links safely, not internal ones', () => {
    expect(inlineToHtml([{ type: 'link', fields: { url: 'https://e.com' }, children: [text('x')] }])).toContain(
      'rel="noopener noreferrer"',
    );
    expect(inlineToHtml([{ type: 'link', fields: { url: '/about/' }, children: [text('x')] }])).not.toContain('target=');
  });

  it('renders a Japanese term with a visible reading and an aria-hidden tooltip (page) or plain text (feed)', () => {
    const node: LexicalNode = { type: 'inlineBlock', fields: { blockType: 'jp', t: '表札', r: 'hyōsatsu', en: 'nameplate' } };
    const page = inlineToHtml([node]);
    expect(page).toContain('(hyōsatsu)');
    expect(page).toContain('class="jp-tip" aria-hidden="true"');
    expect(page).toContain('visually-hidden');
    const feed = inlineToHtml([node], { feed: true });
    expect(feed).toBe('<span lang="ja">表札</span> (hyōsatsu, nameplate)');
  });

  it('makes internal links absolute in feeds', () => {
    const html = inlineToHtml([{ type: 'link', fields: { url: '/posts/x/' }, children: [text('x')] }], {
      feed: true,
      origin: 'https://smkabir.com',
    });
    expect(html).toContain('href="https://smkabir.com/posts/x/"');
    expect(html).not.toContain('target=');
  });

  it('fails loudly on a node it cannot render', () => {
    expect(() => inlineToHtml([{ type: 'mystery' } as LexicalNode])).toThrow(/Unsupported inline/);
  });
});

describe('headings', () => {
  it('slugifies Japanese without dropping kana or kanji', () => {
    expect(slugifyHeading('なぜ静的サイトなのか？')).toBe('なぜ静的サイトなのか');
    expect(slugifyHeading('  Hello, World!  ')).toBe('hello-world');
    expect(slugifyHeading('???')).toBe('section');
  });

  it('numbers duplicates and never collides with ids the layout owns', () => {
    const d = doc(heading('h2', 'Setup'), heading('h2', 'Setup'), heading('h2', 'Main'), heading('h3', 'Search'), heading('h1', 'Ignored'));
    expect(headings(d).map((h) => h.id)).toEqual(['setup', 'setup-2', 'main-section', 'search-section']);
  });
});

describe('lists', () => {
  it('folds a nested list (its own list item) into the previous item instead of an empty bullet', () => {
    const l = list('bullet', li(text('a')), li(list('number', li(text('a1')), li(text('a2')))), li(text('b')));
    const items = listItems(l);
    expect(items).toHaveLength(2);
    expect(items[0]!.nested).toHaveLength(1);
    expect(plainText(items[1]!.inline)).toBe('b');
  });

  it('keeps the checked state of checklist items', () => {
    const l = list(
      'check',
      { type: 'listitem', checked: true, children: [text('done')] },
      { type: 'listitem', checked: false, children: [text('todo')] },
    );
    expect(listItems(l).map((i) => i.checked)).toEqual([true, false]);
  });

  it('treats an untouched editor as empty, but not a rule, a table or a block', () => {
    expect(isEmptyDoc(doc(para()))).toBe(true);
    expect(isEmptyDoc(doc(para(text('  '))))).toBe(true);
    expect(isEmptyDoc(doc(para(text('hi'))))).toBe(false);
    expect(isEmptyDoc(doc({ type: 'horizontalrule' }))).toBe(false);
    expect(isEmptyDoc(doc({ type: 'block', fields: { blockType: 'code' } }))).toBe(false);
  });
});
