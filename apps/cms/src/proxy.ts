import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_HEADER, decide, underPrefix } from './lib/accessGate';
import { slashRedirect } from './site/canonical';
import { pageHeaders } from './site/headers';

/** Paths that are the CMS itself, not public pages: no page policy, no nonce. */
const APP_PREFIXES = ['/admin', '/api', '/_next', '/healthz', '/readyz'];

/**
 * Every request is checked here (see lib/accessGate): the public hostname serves pages only, any other hostname needs a
 * valid Cloudflare Access assertion in production. The body of a denial says only that access was refused, never why.
 * Public pages also get their per-request script nonce and security headers.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');
  const decision = await decide({ host, pathname, assertion: request.headers.get(ACCESS_HEADER), env: process.env });

  if (decision.action === 'health') {
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  }
  if (decision.action === 'deny') {
    console.warn(`[access] ${decision.status} ${request.method} ${pathname}: ${decision.reason}`);
    return new NextResponse(decision.status === 404 ? 'Not found' : 'Forbidden', {
      status: decision.status,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const to = slashRedirect(pathname);
    if (to) return NextResponse.redirect(new URL(`${to}${request.nextUrl.search}`, request.url), 308);
  }

  if (APP_PREFIXES.some((x) => underPrefix(pathname, x))) return NextResponse.next();

  // A public page (or a file): give it this request's nonce. Next adds the nonce to its own scripts from the request header.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isPreview = underPrefix(pathname, '/preview');
  const headers = pageHeaders({ nonce, preview: isPreview });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-locale', pathname === '/ja' || pathname.startsWith('/ja/') ? 'ja' : 'en');
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy']!);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

// Everything except Next's own static assets, which carry no data.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
