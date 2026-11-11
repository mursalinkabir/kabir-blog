import type { ReactElement } from 'react';
import { t, formatNumber, type Locale } from '../../i18n';
import { cx } from '../cx';

export function Pagination({
  locale,
  current,
  total,
  hrefFor,
}: {
  locale: Locale;
  current: number;
  total: number;
  hrefFor: (n: number) => string;
}): ReactElement | null {
  if (total <= 1) return null;
  // 1 … (current-1) current (current+1) … total
  const pages: (number | 'gap')[] = [];
  for (let n = 1; n <= total; n++) {
    if (n === 1 || n === total || Math.abs(n - current) <= 1) pages.push(n);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }
  return (
    <nav className="pagination" aria-label={t(locale, 'a11y.pagination')}>
      <ul role="list">
        <li>
          {current > 1 ? (
            <a className="page-link" href={hrefFor(current - 1)} rel="prev" aria-label={t(locale, 'pagination.previous')}>
              ‹
            </a>
          ) : (
            <span className="page-link is-disabled" aria-hidden="true">
              ‹
            </span>
          )}
        </li>
        {pages.map((n, i) =>
          n === 'gap' ? (
            <li key={`gap${i}`} aria-hidden="true">
              <span className="page-gap">…</span>
            </li>
          ) : (
            <li key={n}>
              <a
                className={cx('page-link', n === current && 'is-current')}
                href={hrefFor(n)}
                aria-label={t(locale, 'pagination.page', { n: formatNumber(locale, n) })}
                aria-current={n === current ? 'page' : undefined}
              >
                {formatNumber(locale, n)}
              </a>
            </li>
          ),
        )}
        <li>
          {current < total ? (
            <a className="page-link" href={hrefFor(current + 1)} rel="next" aria-label={t(locale, 'pagination.next')}>
              ›
            </a>
          ) : (
            <span className="page-link is-disabled" aria-hidden="true">
              ›
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
