import { t, localePath, type Locale } from '../../i18n';
import type { Site } from '../../data/site';
import { absolute, alternatesFor } from '../../lib/routes';
import { publicUrl } from '../../lib/media';
import { prepareRichText } from '../../render/prepare';
import { MediaImage } from '../components/MediaImage';
import { PostCard } from '../components/PostCard';
import { PostMeta } from '../components/PostMeta';
import { ShareLinks } from '../components/ShareLinks';
import { Toc } from '../components/Toc';
import { RichText } from '../rich/RichText';
import type { PageResult } from './types';

/** One article. Null when the post has no page in this locale. Ported from posts/[slug].astro. */
export async function postPage(site: Site, locale: Locale, slug: string): Promise<PageResult | null> {
  const post = site.getPosts(locale).find((p) => p.slug === slug);
  if (!post) return null;
  const path = localePath(locale, `/posts/${post.slug}/`);
  const showToc = post.toc && post.headings.length >= 3;
  const related = site.getRelated(post, locale);
  const siteName = site.siteName(locale);
  const prepared = await prepareRichText([post.content]);
  const image = post.hero ? absolute(publicUrl(post.hero)) : undefined;

  const body = (
    <>
      <article className="container post">
        <header className="post-head">
          <h1>{post.title}</h1>
          <PostMeta post={post} locale={locale} siteName={siteName} readingTime />
          {post.series && (
            <p className="post-series">
              {t(locale, 'posts.series')}: {post.series.name}, {t(locale, 'posts.part', { n: post.series.part })}
            </p>
          )}
        </header>
        {post.hero && (
          <figure className="post-cover">
            <MediaImage media={post.hero} locale={locale} loading="eager" sizes="(min-width: 64rem) 62rem, 100vw" />
            {post.hero.credit && <figcaption>{post.hero.credit}</figcaption>}
          </figure>
        )}
        <div className="post-body">
          {showToc && <Toc headings={post.headings} locale={locale} open={post.headings.length >= 5} />}
          <div className="prose">
            <RichText doc={post.content} locale={locale} prepared={prepared} />
          </div>
          <footer className="post-foot">
            {post.tags.length > 0 && (
              <ul className="tag-list" role="list" aria-label={t(locale, 'posts.tags')}>
                {post.tags.map((tag) => (
                  <li key={tag.slug}>
                    <a className="tag" href={localePath(locale, `/tags/${tag.slug}/`)}>
                      #{tag.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <ShareLinks locale={locale} title={post.title} path={path} />
          </footer>
        </div>
      </article>
      {related.length > 0 && (
        <section className="container related" aria-labelledby="related-title">
          <h2 id="related-title" className="section-title">
            {t(locale, 'related.title')}
          </h2>
          <div className="bento">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} locale={locale} siteName={siteName} level={3} />
            ))}
          </div>
        </section>
      )}
    </>
  );
  return {
    meta: {
      title: post.title,
      description: post.description,
      locale,
      path,
      alternates: alternatesFor(`/posts/${post.slug}/`, post.available),
      type: 'article',
      publishedTime: post.pubDate,
      modifiedTime: post.updatedDate,
      image,
      rss: [{ href: locale === 'en' ? '/rss.xml' : '/ja/rss.xml', title: siteName }],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          datePublished: post.pubDate,
          dateModified: post.updatedDate ?? post.pubDate,
          inLanguage: locale,
          mainEntityOfPage: absolute(path),
          author: { '@type': 'Person', name: site.siteName('en'), url: absolute('/about/') },
          ...(image ? { image } : {}),
        },
      ],
    },
    body,
    usesCode: prepared.usesCode,
  };
}
