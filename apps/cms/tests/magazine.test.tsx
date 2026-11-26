import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadFixtureData } from '../src/site/data/fixtures';
import { categoryRoute, createSite } from '../src/site/data/site';
import { categoryMeta } from '../src/site/lib/categories';
import { postPage } from '../src/site/views/pages/post';
import { homePage } from '../src/site/views/pages/listing';
import { localePath, t, type Locale } from '../src/site/i18n';

const site = createSite(loadFixtureData(), { source: 'fixtures', version: 'magazine' });

describe('magazine home', () => {
  it.each(['en', 'ja'] as const)('links to the newest %s story from the lead', (locale: Locale) => {
    const posts = site.getPosts(locale);
    const html = renderToStaticMarkup(homePage(site, locale, 1)!.body);
    const lead = html.match(/<section class="[^"]*magazine-lead[\s\S]*?<\/section>/)?.[0];
    expect(lead).toContain(`href="${localePath(locale, `/posts/${posts[0]!.slug}/`)}"`);
    expect(lead).toContain(locale === 'ja' ? '記事を読む' : 'Read the story');
    const latest = html.split('id="latest-stories"')[1] ?? '';
    expect(latest).not.toContain(`/posts/${posts[0]!.slug}/`);
    if (posts[1]) expect(latest).toContain(`href="${localePath(locale, `/posts/${posts[1].slug}/`)}"`);
  });

  it.each(['en', 'ja'] as const)('shows the %s topic directory using canonical category links', (locale) => {
    const html = renderToStaticMarkup(homePage(site, locale, 1)!.body);
    const directory = html.match(/<section[^>]+class="magazine-directory"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(directory).toContain('id="magazine-topics"');
    for (const category of new Set(site.getPosts(locale).map((post) => post.category.slug))) {
      expect(directory).toContain(`href="${localePath(locale, `/${categoryRoute[category]}/`)}"`);
      expect(directory).toContain(t(locale, categoryMeta[category].description));
    }
  });

  it('renders the article summary and keeps the contents links anchored to the article', async () => {
    const post = site.getPosts('en').find(({ toc, headings }) => toc && headings.length >= 3)!;
    const page = (await postPage(site, 'en', post.slug))!;
    const html = renderToStaticMarkup(page.body);
    expect(html).toContain(renderToStaticMarkup(<p className="post-dek">{page.meta.description}</p>));
    expect(html).toContain(`href="#${post.headings[0]!.id}"`);
    expect(html).toContain(`id="${post.headings[0]!.id}"`);
  });
});
