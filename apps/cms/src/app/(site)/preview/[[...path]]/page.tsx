import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPayload } from 'payload';
import config from '@payload-config';
import { loadRaw } from '../../../../site/data/load';
import { mapAll } from '../../../../site/data/map';
import { createSite } from '../../../../site/data/site';
import { resolvePage } from '../../../../site/views/resolve';
import { toMetadata } from '../../../../site/views/metadata';
import { Shell } from '../../../../site/views/Shell';
import { t } from '../../../../site/i18n';
import { PreviewRefresh } from '../PreviewRefresh';

// Never cached, never indexed: always the latest saved version, for a signed-in editor on the CMS hostname only.
// (The public hostname answers 404 for /preview before this code runs: src/lib/accessGate.ts.)
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

async function load(path: string[] | undefined) {
  if (path?.some((s) => s.includes('/') || s.includes('\\'))) return null;
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) return null;
  const { data, errors } = mapAll(await loadRaw(payload, { draft: true }));
  for (const e of errors) console.warn(`[preview] skipped: ${e}`);
  const site = createSite(data, { source: 'cms', version: 'preview', preview: true });
  const pathname = `/${(path ?? []).join('/')}${path?.length ? '/' : ''}`;
  const result = await resolvePage(site, pathname);
  return result ? { site, result } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loaded = await load((await params).path);
  return loaded ? { ...toMetadata(loaded.result.meta, loaded.site), robots: { index: false, follow: false } } : {};
}

export default async function PreviewPage({ params }: Params) {
  const loaded = await load((await params).path);
  if (!loaded) notFound();
  const { site, result } = loaded;
  const { meta, body, usesCode } = result;
  const serverURL = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
  return (
    <>
      {usesCode && (
        <>
          <link rel="stylesheet" href="/site/ec.css" precedence="default" />
          <script type="module" src="/site/ec.js" />
        </>
      )}
      <Shell
        site={site}
        locale={meta.locale}
        path={meta.path}
        alternates={meta.alternates}
        banner={
          <div className="fixture-banner" role="note">
            {t(meta.locale, 'preview.banner')}
          </div>
        }
      >
        {body}
      </Shell>
      <PreviewRefresh serverURL={serverURL} />
    </>
  );
}
