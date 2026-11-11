import { siteStore } from '../../../../site/data/store';
import { embedHtml } from '../../../../site/files/embed';
import { embedHeaders } from '../../../../site/headers';

export const dynamic = 'force-dynamic';

/** /embeds/<id>.html: author HTML, served with its own policy (sandbox, no connections) and cached for a year (the id is a content hash). */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([0-9a-f]{24})\.html$/.exec(file);
  const html = m ? embedHtml(await siteStore().get(), m[1]!) : null;
  if (html === null) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(html, { headers: { ...embedHeaders(), 'content-type': 'text/html; charset=utf-8' } });
}
