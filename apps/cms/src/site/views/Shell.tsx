import type { ReactElement, ReactNode } from 'react';
import { t, type Locale } from '../i18n';
import type { Alternates } from '../lib/routes';
import type { Site } from '../data/site';
import { Header } from './Header';
import { Footer } from './Footer';

/** The chrome around every page: skip link, fixture banner, header, main and footer. Ported from BaseLayout.astro. */
export function Shell({
  site,
  locale,
  path,
  alternates = {},
  banner,
  children,
}: {
  site: Site;
  locale: Locale;
  path: string;
  alternates?: Alternates;
  banner?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <>
      <a className="skip-link" href="#main">
        {t(locale, 'a11y.skipToContent')}
      </a>
      {site.source === 'fixtures' && (
        <div className="fixture-banner" role="note">
          {t(locale, 'fixture.banner')}
        </div>
      )}
      {banner}
      <Header site={site} locale={locale} path={path} alternates={alternates} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer site={site} locale={locale} />
    </>
  );
}
