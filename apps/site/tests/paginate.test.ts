import { describe, expect, it } from 'vitest';
import { GRID, pageCount, pageItems, pageParams, pagePath } from '~/lib/paginate';

describe('pagination', () => {
  const posts = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('puts 1 featured + GRID cards on page 1, then GRID per page', () => {
    expect(pageItems(posts(30), 1, true)).toHaveLength(GRID + 1);
    expect(pageItems(posts(30), 2, true)).toHaveLength(GRID);
    expect(pageItems(posts(30), 1, false)).toHaveLength(GRID);
  });

  it('never leaves a page with an odd lone card unless it is the last page, and loses no item', () => {
    for (const featured of [true, false]) {
      for (let total = 0; total <= 60; total++) {
        const pages = pageCount(total, featured);
        const seen = Array.from({ length: pages }, (_, i) => pageItems(posts(total), i + 1, featured)).flat();
        expect(seen).toEqual(posts(total)); // every post once, in order
        for (let p = 2; p < pages; p++) expect(pageItems(posts(total), p, featured)).toHaveLength(GRID); // full middle pages
      }
    }
  });

  it('an empty listing still has one (empty) page', () => {
    expect(pageCount(0, true)).toBe(1);
    expect(pageParams(0)).toEqual([{ page: undefined, n: 1 }]);
  });

  it('builds paths: page 1 is the base, later pages are /page/n/ and ja is prefixed', () => {
    expect(pagePath('en', '/tech/', 1)).toBe('/tech/');
    expect(pagePath('en', '/tech/', 3)).toBe('/tech/page/3/');
    expect(pagePath('ja', '/', 2)).toBe('/ja/page/2/');
  });
});
