// The privacy detectors, with no file-system access and no CLI: safe to import from the CMS bundle and the site build.
// scripts/privacy-scan.mjs is the command-line wrapper over this file (and re-exports it).
//
//   scanImage(buf, ext)               { gps, metadata[] } for a JPEG / WebP / PNG buffer
//   scanText(text, denylist, opts)    findings: emails, phone-like numbers, postal codes, address markers, denylist

// The site's public address, and the SSH user of git remotes (git@github.com:owner/repo.git is not a person).
const ALLOWED_EMAILS = new Set(['hello@smkabir.com', 'git@github.com']);
// GitHub's no-reply commit addresses (ID+name@users.noreply.github.com) exist so a real address never has to be public.
const ALLOWED_EMAIL_DOMAINS = new Set(['users.noreply.github.com']);

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
// `(?!\w|\.\d)`: a number may end a sentence ("call 090-1234-5678.") but not continue as 090-1234-5678.9 or 1.2.3.4.
const PHONE = /(?<![\w.])\+?\d{1,3}[-.\s]\(?\d{1,4}\)?[-.\s]\d{2,4}[-.\s]\d{3,4}(?!\w|\.\d)|(?<![\w.])0\d{1,4}-\d{1,4}-\d{3,4}(?!\w|\.\d)/g;
const POSTAL = /〒\s?\d{3}-?\d{4}/g;
const ADDRESS_MARKER = /[0-9０-９]+\s?丁目|[0-9０-９]+\s?番地/g;

/**
 * Findings for one text file. `denylist` is an array of lowercase terms.
 * `phones: false` skips the phone-number pattern: it is meant for prose, and in SVG path data, viewBoxes and script
 * (HTML embeds) runs of grouped digits are everywhere. Emails, postal codes, address markers and the denylist still apply.
 */
export function scanText(text, denylist = [], { phones = true } = {}) {
  const out = [];
  for (const m of text.matchAll(EMAIL)) {
    const addr = m[0].toLowerCase();
    if (!ALLOWED_EMAILS.has(addr) && !ALLOWED_EMAIL_DOMAINS.has(addr.split('@')[1] ?? '')) out.push(`email ${m[0]}`);
  }
  for (const m of phones ? text.matchAll(PHONE) : []) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 13) out.push(`phone-like number ${m[0]}`);
  }
  for (const m of text.matchAll(POSTAL)) out.push(`postal code ${m[0]}`);
  for (const m of text.matchAll(ADDRESS_MARKER)) out.push(`address marker ${m[0]}`);
  const lower = text.toLowerCase();
  for (const term of denylist) if (lower.includes(term)) out.push('denylisted term (value withheld)');
  return out;
}
