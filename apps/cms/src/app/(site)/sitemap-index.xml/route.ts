import { fileResponse } from '../../../site/files/respond';
import { sitemapIndexXml } from '../../../site/files/sitemap';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return fileResponse(request, sitemapIndexXml(), 'application/xml; charset=utf-8', 'index');
}
export const HEAD = GET;
