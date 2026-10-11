import { localePath, type Locale } from '~/i18n';

/**
 * Cards per page in the two-column grid. A listing with a featured first card shows 1 + GRID on page 1 and GRID after
 * that, so no page ends with a lone card. `SITE_PAGE_SIZE` overrides it (used to test paging).
 */
export const GRID = Number(process.env.SITE_PAGE_SIZE) || 6;

const firstPageSize = (featured: boolean) => GRID + (featured ? 1 : 0);

export const pageCount = (total: number, featured = false) =>
  total <= firstPageSize(featured) ? 1 : 1 + Math.ceil((total - firstPageSize(featured)) / GRID);

export function pageItems<T>(items: T[], page: number, featured = false): T[] {
  if (page === 1) return items.slice(0, firstPageSize(featured));
  const start = firstPageSize(featured) + (page - 2) * GRID;
  return items.slice(start, start + GRID);
}

/** Path of page `n` for a listing whose first page is `base` (e.g. `/tech/`): `/tech/` then `/tech/page/2/`. */
export const pagePath = (locale: Locale, base: string, n: number) => localePath(locale, n === 1 ? base : `${base}page/${n}/`);

/** `[...page]` rest-param values for a listing: undefined for page 1, then `page/2`, `page/3`… */
export const pageParams = (total: number, featured = false) =>
  Array.from({ length: pageCount(total, featured) }, (_, i) => ({ page: i === 0 ? undefined : `page/${i + 1}`, n: i + 1 }));
