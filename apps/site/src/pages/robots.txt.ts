import { SITE } from '~/lib/routes';

// No Disallow lines: pages that must stay out of search (search, thank-you, empty listings) carry
// <meta name="robots" content="noindex">, and a crawler can only obey that if it may fetch the page.
export const GET = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap-index.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
