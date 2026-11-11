// D2 diagrams. The `d2` binary is in the image; it runs on first view and the result is cached in memory. When it is
// missing or fails, the caller shows the source instead, so a diagram problem never takes a page down.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

const FLAGS = ['--theme', '0', '--pad', '16', '-', '-']; // theme 0 = Neutral Default
const TIMEOUT_MS = 10_000;
const MAX_CACHE = 200;
const FAIL_MS = 60_000;

const cache = new Map<string, string>();
const failures = new Map<string, number>();

const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

function runD2(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('d2', FLAGS, { timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(source);
  });
}

/** SVG of a D2 source as a data URI for <img> (an <img> SVG cannot run script), or null when it cannot be rendered. */
export async function renderD2(source: string): Promise<string | null> {
  const key = createHash('sha256').update(source).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;
  const failedAt = failures.get(key);
  if (failedAt && Date.now() - failedAt < FAIL_MS) return null;
  try {
    const uri = toDataUri(await runD2(source));
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, uri);
    return uri;
  } catch (e) {
    if (failures.size >= MAX_CACHE) failures.delete(failures.keys().next().value!);
    failures.set(key, Date.now());
    console.warn(`[diagram] d2 failed, showing the source: ${(e as Error).message.split('\n')[0]}`);
    return null;
  }
}
