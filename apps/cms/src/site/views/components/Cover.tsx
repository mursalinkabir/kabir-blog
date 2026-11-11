import type { ReactElement } from 'react';
import type { Locale } from '../../i18n';
import type { Category, Media } from '../../lib/types';
import { cx } from '../cx';
import { CategoryIcon } from './icons';
import { MediaImage } from './MediaImage';

/** Always decorative: the title link next to it names the destination. Posts without a cover get a tinted tile. */
export function Cover({
  hero,
  category,
  locale,
  eager = false,
  sizes,
}: {
  hero?: Media;
  category: Category['slug'];
  locale: Locale;
  eager?: boolean;
  sizes?: string;
}): ReactElement {
  return hero ? (
    <div className="cover">
      <MediaImage media={hero} locale={locale} decorative loading={eager ? 'eager' : 'lazy'} sizes={sizes} />
    </div>
  ) : (
    <div className={cx('cover', 'cover-fallback', `cover-${category}`)}>
      <CategoryIcon category={category} size={64} />
    </div>
  );
}
