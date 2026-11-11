import type { ReactElement } from 'react';
import { t, type Locale } from '../../i18n';
import type { Heading } from '../../lib/lexical/walk';

/** Expanded by default only on long posts. */
export function Toc({ headings, locale, open = false }: { headings: Heading[]; locale: Locale; open?: boolean }): ReactElement {
  return (
    <details className="toc" open={open}>
      <summary>{t(locale, 'a11y.tableOfContents')}</summary>
      <nav aria-label={t(locale, 'a11y.tableOfContents')}>
        <ol role="list">
          {headings.map((h) => (
            <li key={h.id} className={`depth-${h.depth}`}>
              <a href={`#${h.id}`}>{h.text}</a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}
