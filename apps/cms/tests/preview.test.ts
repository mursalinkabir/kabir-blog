import { describe, expect, it } from 'vitest';
import { previewPath } from '../src/site/preview';

describe('previewPath', () => {
  it.each([
    [['posts', 'x', 'en'], '/preview/posts/x/'],
    [['posts', 'x', 'ja'], '/preview/ja/posts/x/'],
    [['projects', 'p', 'en'], '/preview/projects/p/'],
    [['pages', 'about', 'ja'], '/preview/ja/about/'],
    [['now', undefined, 'en'], '/preview/now/'],
    [['uses', undefined, 'ja'], '/preview/ja/uses/'],
    [['resume', undefined, 'en'], '/preview/resume/'],
  ] as const)('%j', (args, out) => expect(previewPath(...(args as Parameters<typeof previewPath>))).toBe(out));

  it('a slug with odd characters cannot leave /preview/', () => {
    expect(previewPath('posts', '../../admin', 'en')).toMatch(/^\/preview\/posts\/[^/]+\/$/);
    expect(previewPath('posts', '../../admin', 'en')).not.toContain('..');
    expect(previewPath('pages', 'a/b', 'en')).toMatch(/^\/preview\/[^/]+\/$/);
  });
});
