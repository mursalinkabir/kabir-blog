import { categoryRoute, type PostView } from '../../data/site';
import { formatDate, formatNumber, localePath, t, type Locale } from '../../i18n';
import { Cover } from './Cover';
import { CategoryIcon } from './icons';

export function MagazineLead({ post, locale }: { post: PostView; locale: Locale }) {
  const { category } = post;
  return (
    <div className="magazine-feature" data-topic={category.slug}>
      <div className="magazine-feature-copy">
        <a className="magazine-category" href={localePath(locale, `/${categoryRoute[category.slug]}/`)}>
          <CategoryIcon category={category.slug} size={18} />
          {category.name}
        </a>
        <h2>{post.title}</h2>
        <p>{post.description}</p>
        <div className="magazine-feature-meta">
          <time dateTime={post.pubDate}>{formatDate(locale, post.pubDate, { month: 'short' })}</time>
          <span>{t(locale, 'posts.readingTime', { n: formatNumber(locale, post.readingMinutes) })}</span>
        </div>
        <a className="btn magazine-read" href={localePath(locale, `/posts/${post.slug}/`)}>
          {t(locale, 'posts.readStory')}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="magazine-photo">
        <Cover
          hero={post.hero}
          category={category.slug}
          locale={locale}
          eager
          decorative={false}
          develop
          sizes="(min-width: 78rem) 69rem, (min-width: 52rem) 80vw, 100vw"
        />
      </div>
    </div>
  );
}
