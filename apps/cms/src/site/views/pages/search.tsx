import { t, localePath, type Locale } from '../../i18n';
import { bothLocales } from '../../lib/routes';
import { MAX_QUERY, searchSite } from '../../search';
import type { Site } from '../../data/site';
import type { PageResult } from './types';

/** The search page: a GET form and, with a query, the matches. No client script. Never indexed, never cached. */
export function searchPage(site: Site, locale: Locale, rawQuery: string | undefined): PageResult {
  const query = (rawQuery ?? '').slice(0, MAX_QUERY).trim();
  const hits = query ? searchSite(site, locale, query) : [];
  const summary = !query
    ? ''
    : t(locale, hits.length === 0 ? 'search.noResults' : hits.length === 1 ? 'search.oneResult' : 'search.manyResults')
        .replace('[SEARCH_TERM]', `“${query}”`)
        .replace('[COUNT]', String(hits.length));
  return {
    meta: {
      title: t(locale, 'search.title'),
      description: t(locale, 'search.description'),
      locale,
      path: localePath(locale, '/search/'),
      alternates: bothLocales('/search/'),
      noindex: true,
    },
    body: (
      <div className="page">
        <div className="prose-width">
          <header className="page-head">
            <h1 className="page-title">{t(locale, 'search.title')}</h1>
          </header>
          <form className="search-form" method="get" action={localePath(locale, '/search/')} role="search">
            <input
              className="search-input"
              type="search"
              name="q"
              defaultValue={query}
              maxLength={MAX_QUERY}
              placeholder={t(locale, 'search.placeholder')}
              aria-label={t(locale, 'search.placeholder')}
              autoComplete="off"
            />
            <button className="btn" type="submit">
              {t(locale, 'search.title')}
            </button>
          </form>
          {query && (
            <p className="search-summary" role="status">
              {summary}
            </p>
          )}
          {hits.length > 0 && (
            <ol className="search-results" role="list">
              {hits.map((h) => (
                <li key={h.path}>
                  <a className="search-title" href={h.path}>
                    {h.title}
                  </a>
                  {h.description && <p className="search-excerpt">{h.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    ),
  };
}
