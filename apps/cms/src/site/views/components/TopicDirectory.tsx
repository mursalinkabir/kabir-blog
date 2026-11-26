import { type PostView } from '../../data/site';
import { formatNumber, localePath, t, type Locale } from '../../i18n';
import { categoryMeta, categoryOrder } from '../../lib/categories';
import { CategoryIcon } from './icons';

export function TopicDirectory({ locale, posts }: { locale: Locale; posts: PostView[] }) {
  const topics = categoryOrder.flatMap((slug) => {
    const matching = posts.filter((post) => post.category.slug === slug);
    const first = matching[0];
    return first ? [{ slug, name: first.category.name, count: matching.length, meta: categoryMeta[slug] }] : [];
  });

  return (
    <section className="magazine-directory" aria-labelledby="magazine-topics">
      <div className="container wrap">
        <h2 id="magazine-topics">{t(locale, 'posts.browseTopics')}</h2>
        <ul role="list">
          {topics.map(({ slug, name, count, meta }) => (
            <li key={slug} data-topic={slug}>
              <a href={localePath(locale, `/${meta.route}/`)}>
                <span className="directory-icon">
                  <CategoryIcon category={slug} size={22} />
                </span>
                <h3>{name}</h3>
                <p>{t(locale, meta.description)}</p>
                <span className="directory-count">
                  {t(locale, count === 1 ? 'posts.topicCountOne' : 'posts.topicCount', { n: formatNumber(locale, count) })}
                </span>
                <span className="directory-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
