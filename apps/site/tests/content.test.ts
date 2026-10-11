import { describe, expect, it } from 'vitest';
import { hasPage, getPosts, getUsesGroups, navPageExists, pick, sectionLocales } from '~/lib/cms';
import { numericColumns } from '~/lib/table';
import { publicUrl, variantsOf } from '~/lib/media';
import type { Post } from '~/lib/types';

const root = (t: string) => ({
  root: { type: 'root' as const, children: [{ type: 'paragraph', children: t ? [{ type: 'text' as const, text: t, format: 0 }] : [] }] },
});
const post = (over: Partial<Post> = {}): Post => ({
  id: 'p',
  _status: 'published',
  slug: 's',
  pubDate: '2026-01-01T00:00:00Z',
  category: { id: 'c', slug: 'tech', name: { en: 'Tech', ja: 'テック' } },
  tags: [],
  toc: false,
  publishedIn: { en: true, ja: true },
  title: { en: 'T', ja: '題' },
  description: { en: 'D', ja: '説' },
  content: { en: root('hello'), ja: root('こんにちは') },
  ...over,
});

describe('the locale rule (no page without every required field, never another language)', () => {
  it('publishes when everything is present', () => {
    expect(hasPage(post(), 'en')).toBe(true);
    expect(hasPage(post(), 'ja')).toBe(true);
  });
  it.each([
    ['draft', { _status: 'draft' as const }],
    ['not enabled for the locale', { publishedIn: { en: true } }],
    ['no title', { title: { en: 'T' } }],
    ['no description', { description: { en: 'D' } }],
    ['no content', { content: { en: root('hello') } }],
    ['an untouched (empty) editor', { content: { en: root('hello'), ja: root('') } }],
  ])('gives no ja page for: %s', (_name, over) => expect(hasPage(post(over as Partial<Post>), 'ja')).toBe(false));

  it('needs the cover image alt text in that locale', () => {
    const hero = { id: 'm', url: '/x.jpg', width: 1, height: 1, alt: { en: 'A cover' } };
    expect(hasPage(post({ hero }), 'en')).toBe(true);
    expect(hasPage(post({ hero }), 'ja')).toBe(false);
  });
});

describe('fixture site', () => {
  it('has no draft in any locale and no Japanese page for English-only posts', () => {
    for (const l of ['en', 'ja'] as const) expect(getPosts(l).some((p) => p.slug === 'unfinished-draft')).toBe(false);
    expect(getPosts('ja').some((p) => p.slug === 'how-this-site-is-built')).toBe(false);
  });
  it('lists posts newest first and memoises the result', () => {
    const en = getPosts('en');
    expect([...en].sort((a, b) => b.pubDate.localeCompare(a.pubDate))).toEqual(en);
    expect(getPosts('en')).toBe(en);
  });
  it('only links sections that exist: no Japanese Uses page while it has no Japanese items', () => {
    expect(getUsesGroups('ja')).toEqual([]);
    expect(sectionLocales.uses()).toEqual(['en']);
    expect(navPageExists('uses', 'ja')).toBe(false);
    expect(navPageExists('resume', 'ja')).toBe(false);
    expect(navPageExists('tech', 'ja')).toBe(true);
  });
  it('pick() never falls back', () => {
    expect(pick({ en: 'x' }, 'ja')).toBeUndefined();
    expect(pick({ en: '' }, 'en')).toBeUndefined();
  });
});

describe('table columns', () => {
  const cell = (text: string, header = false) => ({ text, header });
  it('right-aligns money, percentages, yen and full-width digits, not words', () => {
    const grid = [
      [cell('Item', true), cell('Basis', true), cell('Monthly (¥)', true)],
      [cell('Electricity'), cell('4 nodes'), cell('1,320')],
      [cell('Total'), cell(''), cell('2,970')],
    ];
    expect(numericColumns(grid)).toEqual([false, false, true]);
    expect(numericColumns([[cell('１２３')], [cell('４５％')]])).toEqual([true]);
    expect(numericColumns([[cell('12')], [cell('n/a')]])).toEqual([false]);
  });
});

describe('media URLs', () => {
  const media = {
    id: 'm',
    url: '/uploads/IMG_4021-original.jpg',
    width: 4000,
    height: 3000,
    alt: { en: 'a' },
    sizes: { '480': { url: '/s/480.webp', width: 480, height: 360 }, '1600': { url: '/s/1600.webp', width: 1600, height: 1200 } },
  };
  it('never prints the upload original when generated sizes exist', () => {
    expect(publicUrl(media)).toBe('/s/1600.webp');
    expect(variantsOf(media).map((v) => v.width)).toEqual([480, 1600]);
  });
  it('falls back to url only for media with no generated sizes (SVG)', () => {
    expect(publicUrl({ ...media, sizes: undefined, url: '/a.svg' })).toBe('/a.svg');
  });
});
