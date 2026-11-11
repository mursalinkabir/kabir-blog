import { fileResponse } from '../../../site/files/respond';
import { robotsTxt } from '../../../site/files/robots';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return fileResponse(request, robotsTxt(), 'text/plain; charset=utf-8', 'robots');
}
export const HEAD = GET;
