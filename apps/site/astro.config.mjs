// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';

const dist = fileURLToPath(new URL('./dist/', import.meta.url));

/** The sitemap runs after the pages are written, so it can ask the page itself whether it opted out of indexing. */
/** @param {string} pageUrl */
function isNoindex(pageUrl) {
  const file = dist + new URL(pageUrl).pathname.replace(/^\//, '') + 'index.html';
  return existsSync(file) && /<meta name="robots" content="[^"]*noindex/.test(readFileSync(file, 'utf8'));
}

export default defineConfig({
  site: 'https://smkabir.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    expressiveCode(),
    sitemap({
      // Same codes as the <html lang> and hreflang in the page headers (en, ja).
      i18n: { defaultLocale: 'en', locales: { en: 'en', ja: 'ja' } },
      filter: (page) => !isNoindex(page),
    }),
  ],
  // No inline scripts on the public site (CSP script-src 'self'): never inline bundled JS.
  vite: { build: { assetsInlineLimit: 0 } },
});
