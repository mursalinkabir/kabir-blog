import { describe, expect, it } from 'vitest';
import { createSite } from '../src/site/data/site';
import { loadFixtureData } from '../src/site/data/fixtures';
import { liveOrigin, liveReport } from '../src/mcp/shared';

const data = loadFixtureData();
const origin = 'https://smkabir.com';

describe('liveReport', () => {
  it('reports a URL for each complete language and reasons for the others', () => {
    const post = data.posts.find((p) => p.publishedIn.en && p.publishedIn.ja)!;
    const broken = structuredClone(data);
    const target = broken.posts.find((p) => p.slug === post.slug)!;
    target.title = { en: target.title.en };
    const site = createSite(broken, { source: 'cms', version: 't' });
    const r = liveReport(site, 'posts', post.slug, origin);
    expect(r.live).toEqual({ en: `${origin}/posts/${post.slug}/` });
    expect(r.notLive).toEqual({ ja: ['title'] });
  });
  it('reports both languages live when both are complete', () => {
    const site = createSite(data, { source: 'cms', version: 't' });
    const post = data.posts.find(
      (p) => p._status === 'published' && p.publishedIn.en && p.publishedIn.ja && site.getPosts('ja').some((x) => x.slug === p.slug),
    )!;
    expect(liveReport(site, 'posts', post.slug, origin).live).toEqual({
      en: `${origin}/posts/${post.slug}/`,
      ja: `${origin}/ja/posts/${post.slug}/`,
    });
  });
  it('reports nothing live for a draft and says why', () => {
    const d = structuredClone(data);
    const p = d.posts.find((x) => x._status === 'published' && x.publishedIn.en)!;
    p._status = 'draft';
    const r = liveReport(createSite(d, { source: 'cms', version: 't' }), 'posts', p.slug, origin);
    expect(r.live).toEqual({});
    expect(r.notLive.en).toContain('status');
  });
  it('an unknown slug is "missing"', () => {
    expect(liveReport(createSite(data, { source: 'cms', version: 't' }), 'posts', 'nope', origin).notLive.en).toEqual(['missing']);
  });
  it('liveOrigin uses the first public host', () => {
    expect(liveOrigin({ SITE_PUBLIC_HOSTS: 'example.org, other.example' })).toBe('https://example.org');
    expect(liveOrigin({})).toBe('https://smkabir.com');
  });
});
