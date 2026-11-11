import type { ReactElement } from 'react';
import { localePath, formatDate, formatNumber, t, type Locale } from '../../i18n';
import { categoryRoute, type PostView } from '../../data/site';
import { Avatar, CategoryIcon } from './icons';

export function PostMeta({
  post,
  locale,
  siteName,
  readingTime = false,
}: {
  post: PostView;
  locale: Locale;
  siteName: string;
  readingTime?: boolean;
}): ReactElement {
  return (
    <ul className="meta" role="list">
      <li className="meta-author">
        <Avatar name={siteName} />
        {siteName}
      </li>
      <li>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5"></rect>
          <path d="M8 3v4M16 3v4M3.5 10h17"></path>
        </svg>
        <time dateTime={post.pubDate}>{formatDate(locale, post.pubDate, { month: locale === 'ja' ? 'long' : 'short' })}</time>
      </li>
      <li className="meta-topic">
        <a href={localePath(locale, `/${categoryRoute[post.category.slug]}/`)}>
          <CategoryIcon category={post.category.slug} size={16} />
          {post.category.name}
        </a>
      </li>
      {readingTime && <li>{t(locale, 'posts.readingTime', { n: formatNumber(locale, post.readingMinutes) })}</li>}
    </ul>
  );
}
