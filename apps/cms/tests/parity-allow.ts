// Parity between the Astro output (apps/site/dist) and the new site, on the same fixture content. Both sides are reduced to
// a list of tokens (tags with sorted attributes, text) and compared. Everything this file ignores is listed here with
// a reason; a difference in text, link target, heading, meta tag, JSON-LD, image source or class name is never allowed.

/** Attributes the Astro build or Pagefind adds, or that mean nothing to a reader. */
export const IGNORED_ATTRIBUTES: { name: RegExp; reason: string }[] = [
  { name: /^data-astro-/, reason: 'Astro scoping and view-transition markers' },
  { name: /^data-pagefind-/, reason: 'Pagefind indexing hints; search is on the server now' },
];

/** `/_astro/x.hash.css` and `/site/x.css?v=1` both become ASSET:<file>. */
export const ASSET_URL = [
  { match: /\/_astro\/([^/.]+)(?:\.[A-Za-z0-9_-]+)?\.(css|js|woff2)/g, replace: 'ASSET:$1.$2' },
  { match: /\/site\/(?:fonts\/)?([^/?]+?)(?:-[a-z]+)?\.(css|js|woff2)(?:\?v=[^"'\s]+)?/g, replace: 'ASSET:$1.$2' },
];

export const ALLOWED_DIFFS = [
  { name: 'asset-urls', reason: 'Astro hashes and splits assets per page; the new site has one stylesheet and one script' },
  { name: 'pagefind-attributes', reason: 'Pagefind attributes and the two <meta data-pagefind-filter> tags are gone with Pagefind' },
  { name: 'astro-attributes', reason: 'data-astro-* markers are Astro internals' },
  { name: 'react-markers', reason: 'React adds hoisting markers and wraps raw HTML blocks in <div|span style="display:contents">' },
  {
    name: 'head-scripts-and-styles',
    reason:
      'scripts, preloads and Next internals in <head> are compared by their meaning (title, meta, canonical, hreflang, feeds, icon), not one by one',
  },
  { name: 'extra-twitter-tags', reason: 'Next adds twitter:title and twitter:description; the content is the same as og:*' },
  { name: 'search-pages', reason: 'the search page is new (server-side); /search/ and /ja/search/ are not compared' },
] as const;
