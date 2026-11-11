import type { ReactElement } from 'react';
import { t, localePath, type Locale } from '../i18n';
import type { Site } from '../data/site';
import { SocialIcon } from './components/SocialIcon';

export function Footer({ site, locale }: { site: Site; locale: Locale }): ReactElement {
  const config = site.getSite();
  const rss = locale === 'en' ? '/rss.xml' : '/ja/rss.xml';
  const links = [
    { key: 'about', href: '/about/' },
    { key: 'contact', href: '/contact/' },
    { key: 'now', href: '/now/' },
    { key: 'uses', href: '/uses/' },
  ].filter((l) => site.navPageExists(l.key, locale));
  const social = [
    ...config.socials.map((s) => ({ name: s.label, label: s.label, href: s.url, me: true })),
    { name: 'rss', label: t(locale, 'footer.rss'), href: rss, me: false },
    { name: 'email', label: config.email, href: `mailto:${config.email}`, me: false },
  ];
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <nav aria-label={t(locale, 'a11y.footerNav')}>
          <ul className="footer-links" role="list">
            {links.map((l) => (
              <li key={l.key}>
                <a href={localePath(locale, l.href)}>{t(locale, `nav.${l.key}` as 'nav.about')}</a>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="footer-social" role="list" aria-label={t(locale, 'a11y.social')}>
          {social.map((s) => (
            <li key={s.name}>
              <a className="icon-btn icon-btn-outline" href={s.href} aria-label={s.label} rel={s.me ? 'me noopener' : undefined}>
                <SocialIcon name={s.name} />
              </a>
            </li>
          ))}
        </ul>
        <p className="footer-copy">
          © {new Date().getFullYear()} {site.siteName(locale)}. {t(locale, 'footer.builtWith')}
        </p>
      </div>
    </footer>
  );
}
