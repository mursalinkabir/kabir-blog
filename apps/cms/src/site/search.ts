// Search over the posts, projects and pages of one language. Plain substring matching on normalised text: no regular
// expressions are built from the query, and the work per request is bounded (query length, result count).
import type { Locale } from './i18n';
import { localePath } from './i18n';
import { plainText } from './lib/lexical/walk';
import type { Site } from './data/site';

export const MAX_QUERY = 100;
export const MAX_HITS = 30;

export interface SearchHit {
  kind: 'post' | 'project' | 'page';
  title: string;
  description: string;
  path: string;
  score: number;
  date?: string;
}

interface Doc extends Omit<SearchHit, 'score'> {
  title_: string;
  tags_: string;
  description_: string;
  body_: string;
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

const index = new WeakMap<Site, Map<Locale, Doc[]>>();

function docsFor(site: Site, locale: Locale): Doc[] {
  let perSite = index.get(site);
  if (!perSite) index.set(site, (perSite = new Map()));
  const hit = perSite.get(locale);
  if (hit) return hit;
  const docs: Doc[] = [];
  const add = (d: Omit<SearchHit, 'score'>, tags: string, body: string) =>
    docs.push({ ...d, title_: norm(d.title), tags_: norm(tags), description_: norm(d.description), body_: norm(body) });
  for (const p of site.getPosts(locale)) {
    add(
      { kind: 'post', title: p.title, description: p.description, path: localePath(locale, `/posts/${p.slug}/`), date: p.pubDate },
      p.tags.map((t) => t.name).join(' '),
      plainText(p.content.root.children),
    );
  }
  for (const p of site.getProjects(locale)) {
    add(
      { kind: 'project', title: p.title, description: p.summary, path: localePath(locale, `/projects/${p.slug}/`) },
      p.stack.join(' '),
      plainText(p.content.root.children),
    );
  }
  for (const p of site.getAllPages(locale)) {
    add({ kind: 'page', title: p.title, description: '', path: localePath(locale, `/${p.slug}/`) }, '', plainText(p.content.root.children));
  }
  perSite.set(locale, docs);
  return docs;
}

/** Documents containing every word of `query`, best first (title 3, tags 2, description 2, body 1 per word), newest first on ties. */
export function searchSite(site: Site, locale: Locale, query: string, limit = MAX_HITS): SearchHit[] {
  const terms = norm(query.slice(0, MAX_QUERY)).split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const d of docsFor(site, locale)) {
    let score = 0;
    let all = true;
    for (const t of terms) {
      const s =
        (d.title_.includes(t) ? 3 : 0) +
        (d.tags_.includes(t) ? 2 : 0) +
        (d.description_.includes(t) ? 2 : 0) +
        (d.body_.includes(t) ? 1 : 0);
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) hits.push({ kind: d.kind, title: d.title, description: d.description, path: d.path, score, date: d.date });
  }
  return hits.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? '')).slice(0, limit);
}
