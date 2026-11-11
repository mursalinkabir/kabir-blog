import type { ReactElement } from 'react';
import type { Locale } from '../../i18n';
import type { Alternates } from '../../lib/routes';
import type { Site } from '../../data/site';

/** What a page tells the layout about itself (becomes the <head> through Next's metadata API). */
export interface PageMeta {
  title: string;
  description: string;
  locale: Locale;
  /** Localized path of this page, e.g. /ja/posts/x/ */
  path: string;
  alternates?: Alternates;
  type?: 'website' | 'article';
  noindex?: boolean;
  /** Absolute URL of the share image (post hero). */
  image?: string;
  publishedTime?: string;
  modifiedTime?: string;
  rss?: { href: string; title: string }[];
  structuredData?: object[];
}

export interface PageResult {
  meta: PageMeta;
  body: ReactElement;
  /** The page has a code block or diagram and needs /site/ec.css and /site/ec.js. */
  usesCode?: boolean;
}

export type PageFn<R> = (site: Site, route: R) => Promise<PageResult | null> | PageResult | null;
