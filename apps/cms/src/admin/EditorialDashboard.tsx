import type { DashboardViewServerProps } from '@payloadcms/next/views';
import type { PayloadRequest } from 'payload';
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
import { listAgentImageUploadPermissions } from '../mcp/imageUploadPermission';
import { setAgentImageUploadAction } from './setAgentImageUploadAction';

const publishingModes = {
  drafts: { label: 'Drafts only', detail: 'Codex can prepare articles. An editor publishes them.' },
  posts: { label: 'Posts only', detail: 'Codex can check and publish articles through MCP.' },
  all: { label: 'Full publishing', detail: 'Codex can publish posts, pages, projects and site settings through MCP.' },
};

const iconPaths = {
  posts: 'M7 3h8l4 4v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M8.5 12h7m-7 4h7',
  media: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm-.5 13 5-5 3 3 2-2 5 5M15.75 8h.01',
  pages: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 8h18m-12 0v13',
  projects: 'M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  draft: 'M12 20h9M15 5l4 4M4 20l4-1L21 6l-4-4L4 15Z',
  published: 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Zm-13 0 2.5 2.5 5.5-5.5',
  codex: 'm5 7 5 5-5 5m7 0h7',
  add: 'M12 5v14M5 12h14',
  outbound: 'M7 17 17 7M7 7h10v10',
  next: 'M9 6l6 6-6 6',
} as const;

function Icon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

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
      <span className="editorial-row-icon" data-kind={draft ? 'draft' : 'published'}>
        <Icon name={draft ? 'draft' : 'published'} />
      </span>
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
        <div className="editorial-row-actions">
          {available.map((locale) => (
            <a
              key={locale}
              href={draft ? previewPath('posts', doc.slug, locale) : absolute(localePath(locale, `/posts/${doc.slug}/`))}
              aria-label={`${draft ? 'Preview' : 'Read'} ${title} in ${locale === 'ja' ? 'Japanese' : 'English'}`}
            >
              <span>{draft ? 'Preview' : 'Read'}</span> {locale.toUpperCase()}
              <Icon name="outbound" />
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

export function EditorialDashboardView({ initPageResult: { req } }: DashboardViewServerProps) {
  return <EditorialDashboard req={req} />;
}

export async function EditorialDashboard({ req }: { req: PayloadRequest }) {
  if (roleOf(req.user) !== 'admin') return null;
  const collectionsUrl = `${req.payload.config.routes.admin}/collections`;
  const postsUrl = `${collectionsUrl}/posts`;
  const mode = agentPublishingMode();
  const publishing = publishingModes[mode];
  const [drafts, published, imageUploads] = await Promise.allSettled([
    recentPosts(req, 'draft'),
    recentPosts(req, 'published'),
    listAgentImageUploadPermissions(req),
  ]);
  for (const result of [drafts, published, imageUploads]) {
    if (result.status === 'rejected') req.payload.logger.error({ err: result.reason, msg: 'Could not load editorial dashboard data' });
  }
  const panels = [
    { id: 'editorial-drafts', title: 'Recent drafts', result: drafts, empty: 'There are no drafts yet.', draft: true },
    { id: 'editorial-published', title: 'Recently published', result: published, empty: 'There are no published posts yet.', draft: false },
  ];
  const shortcuts = [
    { slug: 'posts', title: 'Posts', detail: 'Write and publish' },
    { slug: 'media', title: 'Media', detail: 'Manage images' },
    { slug: 'pages', title: 'Pages', detail: 'Edit site pages' },
    { slug: 'projects', title: 'Projects', detail: 'Manage the portfolio' },
  ] as const;
  return (
    <section className="editorial-dashboard" aria-labelledby="editorial-title">
      <header className="editorial-header">
        <div>
          <h1 id="editorial-title">Editorial workspace</h1>
          <p>Manage English and Japanese content for smkabir.com.</p>
        </div>
        <div className="editorial-header-actions">
          <a href={absolute('/')} className="editorial-visit">
            View site <Icon name="outbound" />
          </a>
          <a className="editorial-primary" href={`${postsUrl}/create`}>
            <Icon name="add" /> New post
          </a>
        </div>
      </header>
      <nav className="editorial-shortcuts" aria-label="Content shortcuts">
        {shortcuts.map(({ slug, title, detail }) => (
          <a key={slug} href={`${collectionsUrl}/${slug}`}>
            <span className="editorial-shortcut-icon" data-kind={slug}>
              <Icon name={slug} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <Icon name="next" />
          </a>
        ))}
      </nav>
      <div className="editorial-panels">
        {panels.map(({ id, title, result, empty, draft }) => (
          <section key={id} className="editorial-panel" data-kind={draft ? 'draft' : 'published'} aria-labelledby={id}>
            <header className="editorial-panel-header">
              <h2 id={id}>{title}</h2>
              {result.status === 'fulfilled' && <span className="editorial-count">{result.value.totalDocs} total</span>}
            </header>
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
        <section className="editorial-panel editorial-mcp" aria-labelledby="editorial-mcp-title">
          <header className="editorial-panel-header">
            <div>
              <div className="editorial-mcp-heading">
                <span className="editorial-row-icon">
                  <Icon name="codex" />
                </span>
                <h2 id="editorial-mcp-title">Codex publishing</h2>
                <span className="editorial-mode" data-mode={mode}>
                  {publishing.label}
                </span>
              </div>
              <p>{publishing.detail}</p>
            </div>
            <nav className="editorial-row-actions" aria-label="Codex tools">
              <a href={`${collectionsUrl}/agent-log`}>Agent activity</a>
              <a href={`${collectionsUrl}/payload-mcp-api-keys`}>MCP keys</a>
            </nav>
          </header>
          <div className="editorial-mcp-uploads">
            <h3>MCP image uploads</h3>
            {imageUploads.status === 'rejected' ? (
              <p>Couldn’t load agent keys.</p>
            ) : imageUploads.value.length === 0 ? (
              <p>No agent keys are configured.</p>
            ) : (
              <ul>
                {imageUploads.value.map(({ id, label, enabled }) => (
                  <li key={id}>
                    <div>
                      <strong>{label ? `${label} (key #${id})` : `Key #${id}`}</strong>
                      <small>{enabled ? 'Uploads enabled' : 'Uploads disabled'}</small>
                    </div>
                    <form action={setAgentImageUploadAction}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="enabled" value={String(!enabled)} />
                      <button type="submit" aria-label={`${enabled ? 'Disable' : 'Enable'} uploads for ${label || `key #${id}`}`}>
                        {enabled ? 'Disable uploads' : 'Enable uploads'}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
