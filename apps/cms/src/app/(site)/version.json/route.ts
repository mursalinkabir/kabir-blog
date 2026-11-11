import { siteStore } from '../../../site/data/store';
import { versionJson } from '../../../site/files/version';

export const dynamic = 'force-dynamic';

/** The release check polls this. It loads the site first so `content_version` is never empty after a start. */
export async function GET() {
  try {
    await siteStore().get();
  } catch {
    /* a first load that failed is visible as content_version: null */
  }
  return new Response(versionJson(siteStore().status()), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
