import { headers } from 'next/headers';

// Rendered per request: the content snapshot is the cache, and every response carries its own script nonce.
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  await headers();
  return <p>path: {path.join('/')}</p>;
}
