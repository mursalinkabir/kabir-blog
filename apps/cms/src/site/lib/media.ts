import type { Media } from './types';

export interface MediaVariant {
  url: string;
  width: number;
  height: number;
}

/** The generated sizes of an image, smallest first. */
export function variantsOf(media: Media): MediaVariant[] {
  return Object.values(media.sizes ?? {}).sort((a, b) => a.width - b.width);
}

/**
 * The URL the site is allowed to print: the largest *generated* size. The upload original (`media.url`) can be an
 * unprocessed camera file, so it is never emitted when any generated size exists (docs/PLAN.md, privacy guardrails).
 * Media with no generated sizes (SVG illustrations) fall back to `url`.
 */
export function publicUrl(media: Media): string {
  const variants = variantsOf(media);
  return variants.length > 0 ? variants[variants.length - 1]!.url : media.url;
}
