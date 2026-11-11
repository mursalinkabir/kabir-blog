import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSite } from '../src/site/data/site';
import { loadFixtureData } from '../src/site/data/fixtures';
import { MAX_HITS, MAX_QUERY, searchSite } from '../src/site/search';
import { searchPage } from '../src/site/views/pages/search';
import { Shell } from '../src/site/views/Shell';
import { createElement } from 'react';

const site = createSite(loadFixtureData(), { source: 'fixtures', version: 't' });
const page = (q: string | undefined, locale: 'en' | 'ja' = 'en') => {
  const r = searchPage(site, locale, q);
  return { r, html: renderToStaticMarkup(createElement(Shell, { site, locale, path: r.meta.path, children: r.body })) };
};

describe('searchSite', () => {
  it('finds a post by a word in its title, and ranks a title hit above a body-only hit', () => {
    const hits = searchSite(site, 'en', 'TraderBuddy');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0]!.title.toLowerCase()).toContain('traderbuddy');
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
  });
  it('matches Japanese text and full-width forms (NFKC)', () => {
    const ja = site.getPosts('ja')[0]!;
    const word = ja.title.slice(0, 2);
    expect(searchSite(site, 'ja', word).some((h) => h.title === ja.title)).toBe(true);
    expect(searchSite(site, 'en', 'ＴＲＡＤＥＲＢＵＤＤＹ').length).toBe(searchSite(site, 'en', 'traderbuddy').length);
  });
  it('searches only the requested locale', () => {
    for (const h of searchSite(site, 'ja', 'traderbuddy')) expect(h.path.startsWith('/ja/')).toBe(true);
  });
  it('an empty or whitespace query returns nothing', () => expect(searchSite(site, 'en', '   ')).toEqual([]));
  it('treats regex characters as text', () => expect(() => searchSite(site, 'en', '(.*)+$[')).not.toThrow());
  it('uses at most the first 100 characters of the query', () => {
    const word = 'kubernetes';
    expect(searchSite(site, 'en', word + ' '.repeat(MAX_QUERY) + 'zzzzzz')).toEqual(searchSite(site, 'en', word));
  });
  it('returns at most 30 hits', () => expect(searchSite(site, 'en', 'a').length).toBeLessThanOrEqual(MAX_HITS));
});

describe('the search page', () => {
  it('echoes the query escaped, is noindex and has a GET form with one text field and no script', () => {
    const { r, html } = page('"><img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(r.meta.noindex).toBe(true);
    const form = /<form[^>]*>/.exec(html)![0];
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/search/"');
    expect(html).toMatch(/<input[^>]+name="q"/);
    expect(html).not.toContain('<script');
  });
  it('shows the count for a query that matches', () => {
    const { html } = page('traderbuddy');
    expect(html).toMatch(/search-summary/);
    expect(html).toContain('search-results');
  });
  it('is in Japanese for /ja/ and links stay in Japanese', () => {
    const { html } = page('日本', 'ja');
    expect(html).toContain('action="/ja/search/"');
  });
  it('a 5,000-character query is cut to 100 characters', () => {
    const { html } = page('x'.repeat(5000));
    expect(html.match(/x{101,}/)).toBeNull();
  });
});
