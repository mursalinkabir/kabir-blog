import type { PayloadRequest, WidgetServerProps } from 'payload';
import { roleOf } from '../access';
import { agentPublishingMode } from '../lib/agentPolicy';
import type { Post as PayloadPost } from '../payload-types';
import { localized, createContext, mapPost } from '../site/data/map';
import { hasPage } from '../site/data/site';
import { formatDate, htmlLang, localePath, locales, type Locale } from '../site/i18n';
import { absolute } from '../site/lib/routes';
import type { Post } from '../site/lib/types';
import { previewPath } from '../site/preview';
import { SLUG_PATTERN } from '../hooks/slug';

const publishingModes = {
  drafts: { label: 'Drafts only', detail: 'Codex can prepare articles. An editor publishes them.' },
  posts: { label: 'Posts only', detail: 'Codex can check and publish articles through MCP.' },
  all: { label: 'Full publishing', detail: 'Codex can publish posts, pages, projects and site settings through MCP.' },
};

type Status = 'draft' | 'published';
type EditorialPost = Pick<
  PayloadPost,
  'id' | 'title' | 'slug' | 'updatedAt' | 'pubDate' | 'category' | 'hero' | 'content' | 'description' | 'publishedIn' | '_status'
>;

function recentPosts(req: PayloadRequest, status: Status) {
  const draft = status === 'draft';
  return req.payload.find({
    req,
    overrideAccess: false,
    collection: 'posts',
    draft,
    locale: 'all',
    fallbackLocale: false,
    limit: 5,
    depth: 1,
    sort: draft ? ['-updatedAt', '-id'] : ['-pubDate', '-id'],
    where: { _status: { equals: status } },
    select: {
      title: true,
      slug: true,
      updatedAt: true,
      pubDate: true,
      publishedIn: true,
      description: true,
      content: true,
      category: true,
      hero: true,
      _status: true,
    },
    populate: { categories: { name: true, slug: true }, media: { alt: true, filename: true, url: true, sizes: true } },
  });
}

function availableLocales(doc: EditorialPost) {
  if (!doc.slug || !SLUG_PATTERN.test(doc.slug) || typeof doc.category !== 'object' || !doc.category) return [];
  if (doc.hero && typeof doc.hero !== 'object') return [];
  try {
    // Reuse the reader site's rules for required translations, cover alt text and content.
    const ctx = createContext({
      media: doc.hero ? [doc.hero] : [],
      categories: [doc.category],
      posts: [],
      projects: [],
      pages: [],
      tags: [],
      globals: { site: null, now: null, uses: null, resume: null },
    });
    // The preview check needs the cover and category, not every image inside the article.
    const post = mapPost(ctx, { ...doc, _status: 'draft' }) as Post;
    if (doc.hero && !post.hero) return [];
    return locales.filter((locale) => hasPage(post, locale, true));
  } catch {
    return [];
  }
}

function PostRow({ doc, draft, postsUrl }: { doc: EditorialPost; draft: boolean; postsUrl: string }) {
  const names = localized(doc.title);
  const editLocale: Locale = !names?.en && names?.ja ? 'ja' : 'en';
  const title: string = names?.[editLocale] ?? doc.slug ?? 'Untitled post';
  const date = draft ? doc.updatedAt : doc.pubDate;
  const available = availableLocales(doc);
  return (
    <li className="editorial-row">
      <div>
        <a
          className="editorial-post"
          href={`${postsUrl}/${doc.id}?locale=${editLocale}`}
          lang={names?.[editLocale] ? htmlLang[editLocale] : undefined}
        >
          {title}
        </a>
        {date && <time dateTime={date}>{formatDate('en', date, { month: 'short' })}</time>}
      </div>
      {available.length > 0 && (
        <div className="editorial-actions">
          {available.map((locale) => (
            <a
              key={locale}
              href={draft ? previewPath('posts', doc.slug, locale) : absolute(localePath(locale, `/posts/${doc.slug}/`))}
              aria-label={`${draft ? 'Preview' : 'Read'} ${title} in ${locale === 'ja' ? 'Japanese' : 'English'}`}
            >
              {draft ? 'Preview' : 'Read'} {locale.toUpperCase()} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

export async function EditorialDashboard({ req }: WidgetServerProps) {
  if (roleOf(req.user) !== 'admin') return null;
  const collectionsUrl = `${req.payload.config.routes.admin}/collections`;
  const postsUrl = `${collectionsUrl}/posts`;
  const mode = agentPublishingMode();
  const publishing = publishingModes[mode];
  const [drafts, published] = await Promise.allSettled([recentPosts(req, 'draft'), recentPosts(req, 'published')]);
  for (const result of [drafts, published]) {
    if (result.status === 'rejected') req.payload.logger.error({ err: result.reason, msg: 'Could not load editorial dashboard posts' });
  }
  const panels = [
    { title: 'Recent drafts', result: drafts, empty: 'There are no drafts yet.', draft: true },
    { title: 'Recently published', result: published, empty: 'There are no published posts yet.', draft: false },
  ];
  return (
    <section className="editorial-dashboard" aria-labelledby="editorial-title">
      <header className="editorial-header">
        <h1 id="editorial-title">Editorial dashboard</h1>
        <div className="editorial-actions">
          <a href={postsUrl}>Browse posts</a>
          <a className="editorial-primary" href={`${postsUrl}/create`}>
            New post <span aria-hidden="true">+</span>
          </a>
        </div>
      </header>
      <section className="editorial-mcp" aria-labelledby="editorial-mcp-title">
        <div>
          <div className="editorial-mcp-heading">
            <h2 id="editorial-mcp-title">Codex publishing</h2>
            <span className="editorial-mode" data-mode={mode}>
              {publishing.label}
            </span>
          </div>
          <p>{publishing.detail}</p>
        </div>
        <div className="editorial-actions">
          <a href={`${collectionsUrl}/agent-log`}>Agent activity</a>
          <a href={`${collectionsUrl}/payload-mcp-api-keys`}>MCP keys</a>
        </div>
      </section>
      <div className="editorial-panels">
        {panels.map(({ title, result, empty, draft }) => (
          <section key={title} className="editorial-panel" aria-labelledby={draft ? 'editorial-drafts' : 'editorial-published'}>
            <h2 id={draft ? 'editorial-drafts' : 'editorial-published'}>{title}</h2>
            {result.status === 'rejected' ? (
              <p className="editorial-empty">Couldn’t load these posts. Open the posts collection to try again.</p>
            ) : result.value.docs.length === 0 ? (
              <p className="editorial-empty">{empty}</p>
            ) : (
              <ul>
                {result.value.docs.map((doc) => (
                  <PostRow key={doc.id} doc={doc} draft={draft} postsUrl={postsUrl} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
