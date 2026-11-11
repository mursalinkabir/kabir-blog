import type { ReactElement } from 'react';
import { t, localePath, type Locale, type StringKey } from '../../i18n';
import type { ProjectView } from '../../data/site';
import { cx } from '../cx';
import { MediaImage } from './MediaImage';

export function ProjectCards({ projects, locale, level = 2 }: { projects: ProjectView[]; locale: Locale; level?: 2 | 3 }): ReactElement {
  const H = `h${level}` as 'h2';
  return (
    <div className="bento">
      {projects.map((p) => (
        <article key={p.slug} className="card tile" data-topic="tech">
          <a className="card-cover" href={localePath(locale, `/projects/${p.slug}/`)} tabIndex={-1} aria-hidden="true">
            <div className={cx('cover', !p.hero && 'cover-fallback')}>
              {p.hero ? (
                <MediaImage media={p.hero} locale={locale} decorative />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="56"
                  height="56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.500 5l-3 14" />
                </svg>
              )}
            </div>
          </a>
          <div className="tile-body">
            <ul className="meta" role="list">
              <li>{t(locale, `projects.statuses.${p.status}` as StringKey)}</li>
              {p.stack.slice(0, 3).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <H className="card-title">
              <a href={localePath(locale, `/projects/${p.slug}/`)}>{p.title}</a>
            </H>
            <p className="card-excerpt">{p.summary}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
