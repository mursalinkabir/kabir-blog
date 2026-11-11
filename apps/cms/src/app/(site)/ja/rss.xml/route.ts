import { siteStore } from '../../../../site/data/store';
import { fileResponse } from '../../../../site/files/respond';
import { rssXml } from '../../../../site/files/rss';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const site = await siteStore().get();
  return fileResponse(request, rssXml(site, 'ja'), 'application/rss+xml; charset=utf-8', site.version);
}
export const HEAD = GET;
