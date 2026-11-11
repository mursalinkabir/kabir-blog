import { codeAssets } from '../../../../site/render/code';

export const dynamic = 'force-static';

/** The code highlighter's stylesheet. Referenced with ?v=<release>, so it is cached for a year. */
export async function GET() {
  const { css } = await codeAssets();
  return new Response(css, {
    headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
