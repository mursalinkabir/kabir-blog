import { codeAssets } from '../../../../site/render/code';

export const dynamic = 'force-static';

/** The code highlighter's script (the copy button). */
export async function GET() {
  const { js } = await codeAssets();
  return new Response(js, {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
