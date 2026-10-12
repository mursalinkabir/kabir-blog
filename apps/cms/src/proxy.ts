import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_HEADER, decide } from './lib/accessGate';

/**
 * Every request must carry a valid Cloudflare Access assertion in production (see lib/accessGate).
 * The body of a denial says only that access was refused, never why.
 */
export async function proxy(request: NextRequest) {
  const decision = await decide({
    pathname: request.nextUrl.pathname,
    assertion: request.headers.get(ACCESS_HEADER),
    env: process.env,
  });

  if (decision.action === 'health') {
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  }
  if (decision.action === 'deny') {
    console.warn(`[access] ${decision.status} ${request.method} ${request.nextUrl.pathname}: ${decision.reason}`);
    return new NextResponse('Forbidden', {
      status: decision.status,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.next();
}

// Everything except Next's own static assets, which carry no data.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
