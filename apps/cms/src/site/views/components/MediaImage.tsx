import type { ReactElement } from 'react';
import type { Locale } from '../../i18n';
import type { Media } from '../../lib/types';
import { pick } from '../../data/site';
import { publicUrl, variantsOf } from '../../lib/media';

interface Props {
  media: Media;
  locale: Locale;
  loading?: 'lazy' | 'eager';
  sizes?: string;
  /** Decorative duplicate of a nearby link or heading: empty alt. */
  decorative?: boolean;
}

/**
 * Alt text is a localized field with no fallback: a missing translation throws instead of quietly showing another
 * language. Posts whose cover lacks alt in a locale never reach this component (data/site.ts). Only generated sizes
 * are printed; the upload original is never emitted (lib/media.ts).
 */
export function MediaImage({
  media,
  locale,
  loading = 'lazy',
  sizes = '(min-width: 44rem) 42rem, 100vw',
  decorative = false,
}: Props): ReactElement {
  const alt = decorative ? '' : pick(media.alt, locale);
  if (alt === undefined) throw new Error(`Media ${media.id} has no ${locale} alt text`);
  const variants = variantsOf(media);
  const srcSet = variants.length > 0 ? variants.map((v) => `${v.url} ${v.width}w`).join(', ') : undefined;
  return (
    <img
      src={publicUrl(media)}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={media.width}
      height={media.height}
      loading={loading}
      decoding="async"
      fetchPriority={loading === 'eager' ? 'high' : undefined}
    />
  );
}
