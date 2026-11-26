import type { ReactElement } from 'react';
import type { Locale } from '../../i18n';
import type { Category, Media } from '../../lib/types';
import { cx } from '../cx';
import { CategoryIcon } from './icons';
import { MediaImage } from './MediaImage';

/** Link previews use a decorative image. Posts without a cover get a tinted tile. */
export function Cover({
  hero,
  category,
  locale,
  eager = false,
  decorative = true,
  develop = false,
  sizes,
}: {
  hero?: Media;
  category: Category['slug'];
  locale: Locale;
  eager?: boolean;
  decorative?: boolean;
  develop?: boolean;
  sizes?: string;
}): ReactElement {
  return hero ? (
    <div
      className="cover"
      data-moment={develop ? 'picture-develops' : undefined}
      data-moment-opts={develop ? '{"look":"film"}' : undefined}
    >
      <MediaImage media={hero} locale={locale} decorative={decorative} loading={eager ? 'eager' : 'lazy'} sizes={sizes} />
    </div>
  ) : (
    <div className={cx('cover', 'cover-fallback', `cover-${category}`)}>
      <CategoryIcon category={category} size={64} />
    </div>
  );
}
