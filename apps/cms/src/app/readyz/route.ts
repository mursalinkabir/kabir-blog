import { getPayload } from 'payload';
import config from '@payload-config';

// Readiness probe. It is not behind the Access check (the kubelet cannot present an assertion; see lib/accessGate)
// and reveals nothing: 200 means Payload started, migrations ran and the database answered; 503 means it did not.
// The first probe is also what makes a new pod apply its migrations before it takes traffic.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getPayload({ config });
    await payload.find({ collection: 'categories', limit: 1, depth: 0, overrideAccess: true });
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[readyz] not ready:', error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
