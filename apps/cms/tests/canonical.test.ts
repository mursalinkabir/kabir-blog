import { describe, expect, it } from 'vitest';
import { slashRedirect } from '../src/site/canonical';

describe('slashRedirect', () => {
  it.each([
    ['/posts/x', '/posts/x/'],
    ['/ja', '/ja/'],
    ['/tags/a/page/2', '/tags/a/page/2/'],
  ])('%s redirects to %s', (from, to) => expect(slashRedirect(from)).toBe(to));
  it.each([
    '/',
    '/posts/x/',
    '/rss.xml',
    '/embeds/abc.html',
    '/site/site.css',
    '/api/mcp',
    '/API/posts',
    '/admin',
    '/admin/collections/posts',
    '/_next/static/x',
    '/healthz',
    '/readyz',
    '/preview',
    '//evil.com',
    '/\\evil.com',
    '/posts//x',
  ])('%s is left alone', (p) => expect(slashRedirect(p)).toBeNull());
});
