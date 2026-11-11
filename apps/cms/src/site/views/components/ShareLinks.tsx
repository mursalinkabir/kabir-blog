import type { ReactElement } from 'react';
import { t, type Locale } from '../../i18n';
import { absolute } from '../../lib/routes';
import { SocialIcon } from './SocialIcon';

export function ShareLinks({ locale, title, path }: { locale: Locale; title: string; path: string }): ReactElement {
  const url = absolute(path);
  const enc = encodeURIComponent;
  const targets = [
    { key: 'x', icon: 'x', label: t(locale, 'share.x'), href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}` },
    {
      key: 'linkedin',
      icon: 'linkedin',
      label: t(locale, 'share.linkedin'),
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    },
    {
      key: 'facebook',
      icon: 'facebook',
      label: t(locale, 'share.facebook'),
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
    {
      key: 'hatena',
      icon: 'bookmark',
      label: t(locale, 'share.hatena'),
      href: `https://b.hatena.ne.jp/entry/s/${url.replace(/^https:\/\//, '')}`,
    },
  ];
  return (
    <div className="share">
      <span className="share-title">{t(locale, 'share.title')}</span>
      <ul role="list" aria-label={t(locale, 'a11y.share')}>
        {targets.map((s) => (
          <li key={s.key}>
            <a className="icon-btn" href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
              <SocialIcon name={s.icon} />
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="icon-btn"
            data-copy-link={url}
            data-copied={t(locale, 'share.copied')}
            data-failed={t(locale, 'share.copyFailed')}
            hidden
            aria-label={t(locale, 'share.copy')}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path>
              <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"></path>
            </svg>
          </button>
        </li>
      </ul>
      <span className="visually-hidden" role="status" data-copy-status=""></span>
    </div>
  );
}
