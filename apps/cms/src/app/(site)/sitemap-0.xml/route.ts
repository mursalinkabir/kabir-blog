import { siteStore } from '../../../site/data/store';
import { fileResponse } from '../../../site/files/respond';
import { sitemapXml } from '../../../site/files/sitemap';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const site = await siteStore().get();
  return fileResponse(request, sitemapXml(site), 'application/xml; charset=utf-8', site.version);
}
export const HEAD = GET;
