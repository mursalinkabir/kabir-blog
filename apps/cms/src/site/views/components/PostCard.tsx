import type { ReactElement } from 'react';
import { localePath, type Locale } from '../../i18n';
import type { PostView } from '../../data/site';
import { Cover } from './Cover';
import { PostMeta } from './PostMeta';

interface Props {
  post: PostView;
  locale: Locale;
  siteName: string;
  /** The bento grid decides which tile is the feature (first child of `.has-feature`); this only sets the image size hint. */
  featured?: boolean;
  /** The first image on the page is the LCP element. */
  eager?: boolean;
  /** Heading level of the title: 2 on listings, 3 when the card sits under a section heading. */
  level?: 2 | 3;
}

/** The title link is stretched over the whole tile (CSS), so the tile is one target; the cover link stays out of the tab order. */
export function PostCard({ post, locale, siteName, featured = false, eager = false, level = 2 }: Props): ReactElement {
  const H = `h${level}` as 'h2';
  const href = localePath(locale, `/posts/${post.slug}/`);
  return (
    <article className="card tile" data-topic={post.category.slug}>
      <a className="card-cover" href={href} tabIndex={-1} aria-hidden="true">
        <Cover
          hero={post.hero}
          category={post.category.slug}
          locale={locale}
          eager={eager}
          sizes={featured ? '(min-width: 64rem) 40rem, 100vw' : '(min-width: 64rem) 20rem, (min-width: 40rem) 24rem, 100vw'}
        />
      </a>
      <div className="tile-body">
        <PostMeta post={post} locale={locale} siteName={siteName} />
        <H className="card-title">
          <a href={href}>{post.title}</a>
        </H>
        <p className="card-excerpt">{post.description}</p>
      </div>
    </article>
  );
}
