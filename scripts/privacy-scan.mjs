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

// The site's public address, and the SSH user of git remotes (git@github.com:owner/repo.git is not a person).
const ALLOWED_EMAILS = new Set(['hello@smkabir.com', 'git@github.com']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.webp', '.png']);
const TEXT_EXT = new Set(['.md', '.json', '.astro', '.ts', '.mjs', '.css', '.html', '.xml', '.txt', '.svg', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', 'pagefind']);

// ---- image metadata ---------------------------------------------------------------------------------
/** Does a TIFF/EXIF block carry a GPSInfo IFD pointer (tag 0x8825) in IFD0? */
function tiffHasGps(buf, start = 0) {
  if (buf.length < start + 8) return false;
  const little = buf.toString('latin1', start, start + 2) === 'II';
  const u16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd = start + u32(start + 4);
  if (ifd + 2 > buf.length) return false;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > buf.length) break;
    if (u16(entry) === 0x8825) return true;
  }
  return false;
}

const XMP_GPS = /<exif:GPS(Latitude|Longitude)|exif:GPSLatitude|exif:GPSLongitude/i;

/** Returns { gps: boolean, metadata: string[] } for an image buffer. */
export function scanImage(buf, ext) {
  const found = { gps: false, metadata: [] };
  const note = (kind) => found.metadata.push(kind);
  if (ext === '.jpg' || ext === '.jpeg') {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return found;
    let i = 2;
    while (i + 4 <= buf.length && buf[i] === 0xff) {
      const marker = buf[i + 1];
      if (marker === 0xda) break; // start of scan
      const len = buf.readUInt16BE(i + 2);
      const body = buf.subarray(i + 4, i + 2 + len);
      if (marker === 0xe1 && body.toString('latin1', 0, 4) === 'Exif') {
        note('Exif');
        if (tiffHasGps(body, 6)) found.gps = true;
      } else if (marker === 0xe1 && body.toString('latin1', 0, 28).includes('http://ns.adobe.com/xap')) {
        note('XMP');
        if (XMP_GPS.test(body.toString('utf8'))) found.gps = true;
      } else if (marker === 0xe2) note('ICC');
      else if (marker === 0xed) note('IPTC');
      i += 2 + len;
    }
  } else if (ext === '.webp') {
    if (buf.toString('latin1', 0, 4) !== 'RIFF') return found;
    let i = 12;
    while (i + 8 <= buf.length) {
      const id = buf.toString('latin1', i, i + 4);
      const size = buf.readUInt32LE(i + 4);
      const body = buf.subarray(i + 8, i + 8 + size);
      if (id === 'EXIF') {
        note('Exif');
        // The block may or may not start with the "Exif\0\0" prefix.
        if (tiffHasGps(body, body.toString('latin1', 0, 4) === 'Exif' ? 6 : 0)) found.gps = true;
      } else if (id === 'XMP ') {
        note('XMP');
        if (XMP_GPS.test(body.toString('utf8'))) found.gps = true;
      } else if (id === 'ICCP') note('ICC');
      i += 8 + size + (size % 2);
    }
  } else if (ext === '.png') {
    let i = 8;
    while (i + 12 <= buf.length) {
      const size = buf.readUInt32BE(i);
      const type = buf.toString('latin1', i + 4, i + 8);
      const body = buf.subarray(i + 8, i + 8 + size);
      if (type === 'eXIf') {
        note('Exif');
        if (tiffHasGps(body, 0)) found.gps = true;
      } else if (type === 'iTXt' && body.toString('latin1', 0, 17) === 'XML:com.adobe.xmp') {
        note('XMP');
        if (XMP_GPS.test(body.toString('utf8'))) found.gps = true;
      }
      i += 12 + size;
    }
  }
  return found;
}

// ---- text patterns ----------------------------------------------------------------------------------
// The top-level label must be letters, so `pnpm@12.9.1` (a version) is not an address.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
// 10 to 13 digits grouped by spaces, dots or dashes (090-1234-5678, +81 90 1234 5678). Dates and versions have fewer.
const PHONE = /(?<![\w.])\+?\d{1,3}[-.\s]\(?\d{1,4}\)?[-.\s]\d{2,4}[-.\s]\d{3,4}(?![\w.])|(?<![\w.])0\d{1,4}-\d{1,4}-\d{3,4}(?![\w.])/g;
const POSTAL = /〒\s?\d{3}-?\d{4}/g;
const ADDRESS_MARKER = /[0-9０-９]+\s?丁目|[0-9０-９]+\s?番地/g;

/** Findings for one text file. `denylist` is an array of lowercase terms. */
export function scanText(text, denylist = []) {
  const out = [];
  for (const m of text.matchAll(EMAIL)) if (!ALLOWED_EMAILS.has(m[0].toLowerCase())) out.push(`email ${m[0]}`);
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 13) out.push(`phone-like number ${m[0]}`);
  }
  for (const m of text.matchAll(POSTAL)) out.push(`postal code ${m[0]}`);
  for (const m of text.matchAll(ADDRESS_MARKER)) out.push(`address marker ${m[0]}`);
  const lower = text.toLowerCase();
  for (const term of denylist) if (lower.includes(term)) out.push('denylisted term (value withheld)');
  return out;
}

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
