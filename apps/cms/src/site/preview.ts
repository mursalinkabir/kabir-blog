import { localePath, type Locale } from './i18n';
import { SLUG_PATTERN } from '../hooks/slug';

export type PreviewKind = 'posts' | 'pages' | 'projects' | 'now' | 'uses' | 'resume';

/** Where the preview of a document is shown: the page's own path under /preview/ (CMS hostname only). */
export function previewPath(kind: PreviewKind, slug: string | undefined, locale: Locale): string {
  // A slug that is not a plain slug cannot leave /preview/: it is encoded into one harmless segment.
  const seg = slug && SLUG_PATTERN.test(slug) ? slug : encodeURIComponent(slug ?? '').replace(/\./g, '%2E');
  const path =
    kind === 'posts' ? `/posts/${seg}/` : kind === 'projects' ? `/projects/${seg}/` : kind === 'pages' ? `/${seg}/` : `/${kind}/`;
  return `/preview${localePath(locale, path)}`;
}
