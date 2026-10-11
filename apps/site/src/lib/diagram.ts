import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// d2 theme 0 = Neutral Default. `d2 themes` lists the others.
const THEME = '0';
const CACHE = join(process.cwd(), 'node_modules/.cache/d2');
const FLAGS = ['--theme', THEME, '--pad', '16'];

/** The cache is keyed on the d2 version and flags too, so upgrading d2 never serves a stale render. */
let d2Version: string | undefined;
function version(): string {
  d2Version ??= execFileSync('d2', ['--version'], { encoding: 'utf8' }).trim();
  return d2Version;
}

function render(source: string, theme: string): string {
  const key = createHash('sha256')
    .update(`${version()}\n${FLAGS.join(' ')}\n${theme}\n${source}`)
    .digest('hex')
    .slice(0, 24);
  const file = join(CACHE, `${key}.svg`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const svg = execFileSync('d2', ['--theme', theme, '--pad', '16', '-', '-'], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, svg);
  return svg;
}

const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/**
 * Renders D2 source to an SVG, returned as a data URI for <img> (CSP allows `img-src data:`; an <img> SVG cannot
 * run script and cannot clash on ids). Returns null when the `d2`
 * binary is missing locally; in CI that is an error, so a published page never silently loses a diagram.
 */
export function renderD2(source: string): string | null {
  try {
    return toDataUri(render(source, THEME));
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (process.env.CI || !missing) throw new Error(`d2 failed: ${(error as Error).message}`);
    console.warn('[diagram] `d2` is not installed; showing the source instead.');
    return null;
  }
}
