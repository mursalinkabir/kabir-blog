// Privacy scan (CLAUDE.md: "Run scripts/privacy-scan before commit"). Exits 1 on any finding.
//
//   node scripts/privacy-scan.mjs [paths...]      default: apps/site/{src,public}, docs, README/CHANGELOG/CLAUDE
//   PRIVACY_DENYLIST="street name,employer"       extra private terms (never commit this list; CI keeps it as a secret)
//
// Checks: (1) GPS in image metadata (JPEG Exif/XMP, WebP EXIF/XMP, PNG eXIf), (2) personal-data patterns in text:
// emails other than the allow-listed site address, phone numbers, Japanese postal codes and address markers,
// (3) every term in PRIVACY_DENYLIST.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scanImage, scanText } from './privacy-core.mjs';

// Re-exported so existing importers (the build gate, the tests) keep working.
export { scanImage, scanText };

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.webp', '.png']);
const TEXT_EXT = new Set(['.md', '.json', '.astro', '.ts', '.mjs', '.css', '.html', '.xml', '.txt', '.svg', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', 'pagefind']);

// ---- CLI --------------------------------------------------------------------------------------------
function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) return yield path;
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name) || name === 'pnpm-lock.yaml') continue;
    yield* walk(join(path, name));
  }
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const targets = (
    process.argv.slice(2).length
      ? process.argv.slice(2)
      : ['apps/site/src', 'apps/site/public', 'docs', 'README.md', 'CHANGELOG.md', 'CLAUDE.md']
  ).map((p) => resolve(root, p));
  const denylist = (process.env.PRIVACY_DENYLIST ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const problems = [];
  let images = 0;
  let texts = 0;
  let withMetadata = 0;
  for (const target of targets) {
    for (const file of walk(target)) {
      const ext = extname(file).toLowerCase();
      const name = relative(root, file);
      if (IMAGE_EXT.has(ext)) {
        images++;
        const r = scanImage(readFileSync(file), ext);
        if (r.metadata.length) withMetadata++;
        if (r.gps) problems.push(`${name}: GPS location in image metadata`);
      } else if (TEXT_EXT.has(ext)) {
        texts++;
        // SVG is drawing data: coordinates look like phone numbers, so only emails and the denylist apply there.
        const text = readFileSync(file, 'utf8');
        const findings = scanText(text, denylist).filter((f) => ext !== '.svg' || /^(email|denylisted)/.test(f));
        for (const f of findings) problems.push(`${name}: ${f}`);
      }
    }
  }
  if (problems.length) {
    console.error(`privacy-scan: ${problems.length} finding(s)\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log(
    `privacy-scan: clean. ${images} images (no GPS; ${withMetadata} carry other metadata), ${texts} text files, ` +
      `${denylist.length ? denylist.length + ' denylist terms' : 'no PRIVACY_DENYLIST set'}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
