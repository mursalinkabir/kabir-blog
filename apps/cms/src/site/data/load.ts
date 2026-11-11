// Reads the content a snapshot is built from, through Payload's Local API. No mapping here (see map.ts).
import type { Payload } from 'payload';

export interface RawContent {
  media: unknown[];
  categories: unknown[];
  tags: unknown[];
  posts: unknown[];
  projects: unknown[];
  pages: unknown[];
  globals: { site: unknown; now: unknown; uses: unknown; resume: unknown };
}

/**
 * Every document of the content collections with every locale, no fallback, ids for relationships. `draft: true` reads
 * the latest saved version (used by preview); `false` reads what is published.
 */
export async function loadRaw(payload: Payload, opts: { draft: boolean }): Promise<RawContent> {
  const base = {
    locale: 'all',
    fallbackLocale: false,
    depth: 0,
    pagination: false,
    draft: opts.draft,
    overrideAccess: true,
    sort: 'id',
  } as const;
  const list = async (collection: 'media' | 'categories' | 'tags' | 'posts' | 'projects' | 'pages') =>
    (await payload.find({ collection, ...base })).docs as unknown[];
  const global = async (slug: 'site' | 'now' | 'uses' | 'resume') =>
    (await payload.findGlobal({
      slug,
      locale: 'all',
      fallbackLocale: false,
      depth: 0,
      draft: opts.draft,
      overrideAccess: true,
    })) as unknown;
  const [media, categories, tags, posts, projects, pages, site, now, uses, resume] = await Promise.all([
    list('media'),
    list('categories'),
    list('tags'),
    list('posts'),
    list('projects'),
    list('pages'),
    global('site'),
    global('now'),
    global('uses'),
    global('resume'),
  ]);
  return { media, categories, tags, posts, projects, pages, globals: { site, now, uses, resume } };
}
