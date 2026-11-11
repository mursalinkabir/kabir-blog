import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSite } from '../src/site/data/site';
import { loadFixtureData } from '../src/site/data/fixtures';
import { categoryRssXml, rssXml } from '../src/site/files/rss';
import { sitemapIndexXml, sitemapXml } from '../src/site/files/sitemap';
import { robotsTxt } from '../src/site/files/robots';
import { versionJson } from '../src/site/files/version';
import { embedHtml } from '../src/site/files/embed';
import { fileResponse, xml } from '../src/site/files/respond';
import { listPaths } from '../src/site/router';

const data = loadFixtureData();
const site = createSite(data, { source: 'fixtures', version: 'abc' });

describe('rss', () => {
  const feed = rssXml(site, 'en');
  it('has one channel and one item per post, newest first, with absolute links ending in a slash', () => {
    expect(feed.match(/<channel>/g)).toHaveLength(1);
    const posts = site.getPosts('en');
    expect(feed.match(/<item>/g)).toHaveLength(posts.length);
    const links = [...feed.matchAll(/<item><title>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    expect(links).toEqual(posts.map((p) => `https://smkabir.com/posts/${p.slug}/`));
  });
  it('escapes markup in titles and content', () => {
    expect(xml(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
    expect(feed).not.toMatch(/<content:encoded><[^&]/); // the HTML is escaped, never raw
  });
  it('the Japanese feed lists only posts that exist in Japanese', () => {
    expect(rssXml(site, 'ja').match(/<item>/g)).toHaveLength(site.getPosts('ja').length);
  });
  it('a category feed holds only that category', () => {
    const n = site.getPosts('en').filter((p) => p.category.slug === 'tech').length;
    expect(categoryRssXml(site, 'tech').match(/<item>/g) ?? []).toHaveLength(n);
  });
});

describe('sitemap', () => {
  const xmlDoc = sitemapXml(site);
  it('lists every indexable page once and no noindex page', () => {
    const locs = [...xmlDoc.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    for (const p of listPaths(site)) {
      expect(locs.includes(`https://smkabir.com${p.path}`), p.path).toBe(!p.noindex);
    }
  });
  it('gives posts a lastmod and pages with both languages hreflang links', () => {
    expect(xmlDoc).toMatch(/<loc>https:\/\/smkabir\.com\/posts\/[^<]+<\/loc><lastmod>/);
    expect(xmlDoc).toContain('<xhtml:link rel="alternate" hreflang="ja" href="https://smkabir.com/ja/"/>');
  });
  it('the index points at the sitemap', () => expect(sitemapIndexXml()).toContain('https://smkabir.com/sitemap-0.xml'));
});

describe('robots, version, embeds, responses', () => {
  it('robots.txt allows everything and names the sitemap index', () => {
    expect(robotsTxt()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://smkabir.com/sitemap-index.xml\n');
  });
  it('version.json reports the build, the content version and the skipped documents', () => {
    const v = JSON.parse(
      versionJson({ version: 'abc', loadedAt: '2026-01-01T00:00:00.000Z', stale: false, errors: 2 }, { BUILD_ID: 'sha-1' }),
    );
    expect(v).toEqual({
      build_id: 'sha-1',
      content_version: 'abc',
      loaded_at: '2026-01-01T00:00:00.000Z',
      stale: false,
      skipped_documents: 2,
    });
  });
  it('an embed id from the site answers its document; an unknown or malformed id answers nothing', () => {
    const embeds = site.embeds();
    for (const id of embeds.keys()) expect(embedHtml(site, id)).toContain('noindex');
    expect(embedHtml(site, 'ffffffffffffffffffffffff')).toBeNull();
    expect(embedHtml(site, '../x')).toBeNull();
  });
  it('a file response carries a weak ETag and answers 304 to a match', () => {
    const r = fileResponse(new Request('http://x/rss.xml'), 'body', 'text/plain', 'v1');
    expect(r.headers.get('etag')).toBe('W/"v1"');
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(fileResponse(new Request('http://x/', { headers: { 'if-none-match': 'W/"v1"' } }), 'body', 'text/plain', 'v1').status).toBe(304);
  });
});

const DIST = process.env.PARITY_DIST ? path.resolve(process.env.PARITY_DIST) : null;
describe.skipIf(!DIST || !existsSync(DIST))('feeds and sitemap match the Astro build', () => {
  const astro = (f: string) => readFileSync(path.join(DIST!, f), 'utf8');
  it.each([
    ['rss.xml', () => rssXml(site, 'en')],
    ['ja/rss.xml', () => rssXml(site, 'ja')],
    ['tech/rss.xml', () => categoryRssXml(site, 'tech')],
    ['finance/rss.xml', () => categoryRssXml(site, 'finance')],
    ['japan/rss.xml', () => categoryRssXml(site, 'japan')],
  ])('%s', (file, mine) => expect(mine()).toBe(astro(file)));
  it('sitemap addresses and alternates (the order of hreflang links inside one entry does not matter)', () => {
    const entries = (xmlDoc: string) =>
      [...xmlDoc.matchAll(/<url>([\s\S]*?)<\/url>/g)]
        .map(
          (m) =>
            `${/<loc>([^<]+)<\/loc>/.exec(m[1]!)![1]} | ${[...m[1]!.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)]
              .map((x) => `${x[1]} ${x[2]}`)
              .sort()
              .join(', ')}`,
        )
        .sort();
    expect(entries(sitemapXml(site))).toEqual(entries(astro('sitemap-0.xml')));
  });
  it('robots.txt', () => expect(robotsTxt()).toBe(astro('robots.txt')));
});
