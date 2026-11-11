import { siteStore } from '../../../../site/data/store';
import { fileResponse } from '../../../../site/files/respond';
import { categoryRssXml } from '../../../../site/files/rss';

export const dynamic = 'force-dynamic';

// Category feeds are English only; /ja/rss.xml covers Japanese.
export async function GET(request: Request) {
  const site = await siteStore().get();
  return fileResponse(request, categoryRssXml(site, 'tech'), 'application/rss+xml; charset=utf-8', site.version);
}
export const HEAD = GET;
