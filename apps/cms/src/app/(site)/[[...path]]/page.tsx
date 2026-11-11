import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { siteStore } from '../../../site/data/store';
import { resolvePage } from '../../../site/views/resolve';
import { toMetadata } from '../../../site/views/metadata';
import { Shell } from '../../../site/views/Shell';
import { assetUrl } from '../../../site/assets';
import { jsonLd } from '../../../site/lib/jsonld';

// Rendered per request: the content snapshot is the cache, and every response carries its own script nonce.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

/** `['posts', 'x']` -> `/posts/x/`; a segment holding a slash (an encoded %2F) is not a page. */
const pathnameOf = (path: string[] | undefined): string | null =>
  path?.some((s) => s.includes('/') || s.includes('\\')) ? null : `/${(path ?? []).map((s) => s).join('/')}${path?.length ? '/' : ''}`;

// One lookup per request, shared by generateMetadata and the page.
const load = cache(async (pathname: string) => {
  const site = await siteStore().get();
  return { site, result: await resolvePage(site, pathname) };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const pathname = pathnameOf((await params).path);
  if (!pathname) return {};
  const { site, result } = await load(pathname);
  return result ? toMetadata(result.meta, site) : {};
}

export default async function Page({ params }: Params) {
  const pathname = pathnameOf((await params).path);
  if (!pathname) notFound();
  const { site, result } = await load(pathname);
  if (!result) notFound();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const { meta, body, usesCode } = result;
  return (
    <>
      {usesCode && (
        <>
          <link rel="stylesheet" href={assetUrl('/site/ec.css')} precedence="default" />
          <script type="module" src={assetUrl('/site/ec.js')} />
        </>
      )}
      {(meta.structuredData ?? []).map((d, i) => (
        <script key={i} type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
      <Shell site={site} locale={meta.locale} path={meta.path} alternates={meta.alternates}>
        {body}
      </Shell>
    </>
  );
}
