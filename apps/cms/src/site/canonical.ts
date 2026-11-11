import { underPrefix } from '../lib/accessGate';

const SKIP = ['/api', '/admin', '/_next', '/preview', '/healthz', '/readyz'];

/**
 * The slash form a page URL must have, or null when the path needs no redirect. Pages always end in a slash;
 * files (a dot in the last segment) and the app's own paths never get one.
 */
export function slashRedirect(pathname: string): string | null {
  if (pathname.endsWith('/') || pathname.includes('//') || pathname.includes('\\')) return null;
  if (SKIP.some((x) => underPrefix(pathname, x))) return null;
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (last.includes('.')) return null;
  return `${pathname}/`;
}
