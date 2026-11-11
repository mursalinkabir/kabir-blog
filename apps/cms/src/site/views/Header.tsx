import type { ReactElement } from 'react';
import { t, localePath, locales, htmlLang, type Locale, type StringKey } from '../i18n';
import { initials, type Alternates } from '../lib/routes';
import type { Site } from '../data/site';
import { cx } from './cx';

const NAV_PATHS: Record<string, string> = {
  home: '/',
  tech: '/tech/',
  finance: '/finance/',
  japan: '/japan/',
  about: '/about/',
  contact: '/contact/',
  projects: '/projects/',
  resume: '/resume/',
  now: '/now/',
  uses: '/uses/',
  categories: '/categories/',
  tags: '/tags/',
};
const SHORT: Record<Locale, string> = { en: 'EN', ja: '日本語' };
const SVG = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const;

export function Header({
  site,
  locale,
  path,
  alternates,
}: {
  site: Site;
  locale: Locale;
  path: string;
  alternates: Alternates;
}): ReactElement {
  const config = site.getSite();
  // A section is listed only where its page exists in this locale (resume: English only; Uses/Now/About when written).
  const visible = (keys: string[]) => keys.filter((k) => NAV_PATHS[k] && site.navPageExists(k, locale));
  const primary = visible(config.nav);
  const more = visible(config.navMore);
  const home = localePath(locale, '/');
  const hrefOf = (key: string) => localePath(locale, NAV_PATHS[key]!);
  const isCurrent = (key: string) => {
    const href = hrefOf(key);
    if (key === 'home') return path === home || path.startsWith(`${home}page/`);
    return path === href || path.startsWith(href);
  };
  const label = (key: string) => t(locale, `nav.${key}` as StringKey);
  const link = (key: string) => (
    <li key={key}>
      <a href={hrefOf(key)} aria-current={isCurrent(key) ? 'page' : undefined}>
        {label(key)}
      </a>
    </li>
  );
  return (
    <header className="site-header">
      <div className="container header-row">
        <a className="logo" href={home}>
          <span className="logo-mark" aria-hidden="true">
            {initials(site.siteName('en'))}
          </span>
          <span className="logo-text" translate="no">
            {site.siteName(locale)}
          </span>
        </a>

        <nav className="nav-desktop" aria-label={t(locale, 'a11y.mainNav')}>
          <ul role="list">
            {primary.map(link)}
            {more.length > 0 && (
              <li>
                <details className={cx('more', more.some(isCurrent) && 'is-active')}>
                  <summary>
                    {t(locale, 'nav.more')}
                    <svg {...SVG} width="14" height="14" strokeWidth="2.4" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <ul role="list">{more.map(link)}</ul>
                </details>
              </li>
            )}
          </ul>
        </nav>

        <div className="header-tools">
          <ul className="lang-switch" role="list" aria-label={t(locale, 'a11y.language')}>
            {locales.map((l) =>
              l === locale ? (
                <li key={l}>
                  <span className="lang-current" lang={htmlLang[l]} aria-current="true">
                    {SHORT[l]}
                    <span className="visually-hidden"> {t(l, `lang.${l}`)}</span>
                  </span>
                </li>
              ) : alternates[l] ? (
                <li key={l}>
                  <a href={alternates[l]} hrefLang={htmlLang[l]} lang={htmlLang[l]}>
                    {SHORT[l]}
                    <span className="visually-hidden"> {t(l, `lang.${l}`)}</span>
                  </a>
                </li>
              ) : null,
            )}
          </ul>
          <button
            type="button"
            className="icon-btn theme-toggle"
            hidden
            data-to-dark={t(locale, 'a11y.themeToDark')}
            data-to-light={t(locale, 'a11y.themeToLight')}
            aria-label={t(locale, 'a11y.themeToDark')}
          >
            <svg {...SVG} className="icon-sun" width="20" height="20" strokeWidth="2" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>
            </svg>
            <svg {...SVG} className="icon-moon" width="20" height="20" strokeWidth="2" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
            </svg>
          </button>
          <a className="icon-btn" href={localePath(locale, '/search/')} aria-label={t(locale, 'nav.search')}>
            <svg {...SVG} width="20" height="20" strokeWidth="2">
              <circle cx="10.5" cy="10.5" r="6.5"></circle>
              <path d="m15.5 15.5 5 5"></path>
            </svg>
          </a>
          <details className="menu">
            <summary className="icon-btn" aria-label={t(locale, 'a11y.menu')}>
              <svg {...SVG} width="22" height="22" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16"></path>
              </svg>
            </summary>
            <nav className="nav-mobile" aria-label={t(locale, 'a11y.mainNav')}>
              <ul role="list">{[...primary, ...more].map(link)}</ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
