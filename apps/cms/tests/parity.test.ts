// Compares every page of the new site with the Astro build of the same fixtures. Runs only when PARITY_DIST points at an
// Astro `dist/` folder:  PARITY_DIST=apps/site/dist pnpm --filter @smkabir/cms test:parity
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSite } from '../src/site/data/site';
import { loadFixtureData } from '../src/site/data/fixtures';
import { listPaths } from '../src/site/router';
import { resolvePage } from '../src/site/views/resolve';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../src/site/views/Shell';
import { createElement } from 'react';
import { toMetadata } from '../src/site/views/metadata';
import { headOf, tokensOf } from './parity-normalize';

const DIST = process.env.PARITY_DIST ? path.resolve(process.env.PARITY_DIST) : null;
const site = createSite(loadFixtureData(), { source: 'fixtures', version: 'parity' });
const SKIP = new Set(['/search/', '/ja/search/']);

function distPages(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (!statSync(p).isDirectory()) return name === 'index.html' ? [base || '/'] : [];
    if (name === 'pagefind' || name === '_astro') return [];
    return distPages(p, `${base || '/'}${name}/`);
  });
}

/** The new site's page as a full document: metadata rendered as <head> tags, body from the Shell. */
async function ours(pathname: string) {
  const r = await resolvePage(site, pathname);
  if (!r) return null;
  const meta = toMetadata(r.meta, site) as Record<string, any>;
  const tags: string[] = [`<title>${meta.title.absolute}</title>`, `<meta name="description" content="${meta.description}">`];
  const a = meta.alternates;
  tags.push(`<link rel="canonical" href="${a.canonical}">`);
  for (const [l, h] of Object.entries<string>(a.languages ?? {})) tags.push(`<link rel="alternate" hreflang="${l}" href="${h}">`);
  for (const t of a.types?.['application/rss+xml'] ?? [])
    tags.push(`<link rel="alternate" type="application/rss+xml" href="${t.url}" title="${t.title}">`);
  const og = meta.openGraph;
  tags.push(
    `<meta property="og:site_name" content="${og.siteName}">`,
    `<meta property="og:title" content="${og.title}">`,
    `<meta property="og:description" content="${og.description}">`,
    `<meta property="og:type" content="${og.type}">`,
    `<meta property="og:url" content="${og.url}">`,
    `<meta property="og:locale" content="${og.locale}">`,
  );
  for (const l of og.alternateLocale ?? []) tags.push(`<meta property="og:locale:alternate" content="${l}">`);
  if (og.publishedTime) tags.push(`<meta property="article:published_time" content="${og.publishedTime}">`);
  if (og.modifiedTime) tags.push(`<meta property="article:modified_time" content="${og.modifiedTime}">`);
  for (const i of og.images ?? []) tags.push(`<meta property="og:image" content="${i}">`);
  tags.push(`<meta name="twitter:card" content="${meta.twitter.card}">`);
  for (const i of meta.twitter.images ?? []) tags.push(`<meta name="twitter:image" content="${i}">`);
  if (meta.robots) tags.push(`<meta name="robots" content="noindex">`);
  tags.push(`<link rel="icon" href="/favicon.svg" type="image/svg+xml">`);
  // From the layout's `viewport` export (src/app/(site)/layout.tsx), seen in the live HTML of the dev server.
  tags.push(
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0a0e14" media="(prefers-color-scheme: dark)">',
  );
  const ld = (r.meta.structuredData ?? []).map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join('');
  const body = renderToStaticMarkup(
    createElement(Shell, { site, locale: r.meta.locale, path: r.meta.path, alternates: r.meta.alternates, children: r.body }),
  );
  return `<html><head>${tags.join('')}${ld}</head><body>${body}</body></html>`;
}

/** A short, readable account of where two token lists first differ. */
function diff(mine: string[], astro: string[]): string {
  const n = Math.max(mine.length, astro.length);
  for (let i = 0; i < n; i++) {
    if (mine[i] !== astro[i]) {
      const ctx = (a: string[]) => a.slice(Math.max(0, i - 2), i + 3).join('\n      ');
      return `first difference at token ${i} of ${mine.length}/${astro.length}\n  new:\n      ${ctx(mine)}\n  astro:\n      ${ctx(astro)}`;
    }
  }
  return '';
}

describe.skipIf(!DIST || !existsSync(DIST))('parity with the Astro build', () => {
  const all = listPaths(site)
    .map((p) => p.path)
    .filter((p) => !SKIP.has(p));
  const only = process.env.PARITY_ONLY;
  const listed = all.filter((p) => !only || p === only);
  it('serves exactly the pages Astro built', () => {
    const built = distPages(DIST!).filter(
      (p) => !SKIP.has(p) && p !== '/404.html' && !p.startsWith('/embeds/') && p !== '/typography-test/' && p !== '/ja/typography-test/',
    );
    expect(
      all.filter((p) => !built.includes(p)),
      'we serve pages Astro did not build',
    ).toEqual([]);
    expect(
      built.filter((p) => !all.includes(p)),
      'Astro built pages we do not serve',
    ).toEqual([]);
  });

  for (const p of listed) {
    it(`${p} has the same head and body`, async () => {
      const file = path.join(DIST!, p, 'index.html');
      const astro = readFileSync(file, 'utf8');
      const mine = (await ours(p))!;
      const h = headOf(mine);
      const hA = headOf(astro);
      expect(
        h.filter((x) => !hA.includes(x)),
        'head tags only in the new site',
      ).toEqual([]);
      expect(
        hA.filter((x) => !h.includes(x)),
        'head tags only in Astro',
      ).toEqual([]);
      expect(diff(tokensOf(mine), tokensOf(astro))).toBe('');
    });
  }
});
