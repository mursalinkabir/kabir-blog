/** Escapes text for XML (element content and attributes). */
export const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * A text file response with a weak ETag from the content version and a 304 for a matching If-None-Match. Shared caches
 * must revalidate (no s-maxage), like pages: a publish is visible at once.
 */
export function fileResponse(
  request: Request,
  body: string,
  contentType: string,
  version: string,
  extra: Record<string, string> = {},
): Response {
  const etag = `W/"${version}"`;
  const headers = { 'content-type': contentType, 'cache-control': 'public, max-age=0, must-revalidate', etag, ...extra };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body, { headers });
}
