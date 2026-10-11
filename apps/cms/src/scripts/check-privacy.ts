/**
 * Phase 2 gate: an upload that carries GPS must be stored without it. Run with `pnpm --filter @smkabir/cms check:privacy`.
 *
 * Builds a JPEG whose EXIF holds a GPS position, uploads it through the Local API (so the real collection hooks
 * run), then inspects the files Payload wrote: the stored original and every generated size. Also checks that an
 * SVG is refused. Everything it creates is deleted again. Needs the local database; refuses any other host.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getPayload } from 'payload';
import config from '../payload.config';
// Shared with the repo-wide privacy scan, so both use one detector.
import { scanImage } from '../../../../scripts/privacy-scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mediaDir = path.resolve(here, '../../media');

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
})();
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`check:privacy: refusing to run against database host "${host || 'unknown'}"`);
  process.exit(1);
}

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

async function main() {
  const payload = await getPayload({ config });

  // A real-looking photo: noise-free gradient, rotated by EXIF orientation 6, with a GPS position.
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#4a7' } })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '35/1 41/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '139/1 41/1 0/1',
      },
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const before = scanImage(original, '.jpg');
  check('control: the test photo really has GPS', before.gps === true);
  check('control: ...and an orientation flag', (await sharp(original).metadata()).orientation === 6);

  const doc = await payload.create({
    collection: 'media',
    locale: 'en',
    data: { alt: 'privacy check' } as never,
    file: { data: original, mimetype: 'image/jpeg', name: 'privacy-check.jpg', size: original.length },
  });

  const stored = [doc.filename, ...Object.values(doc.sizes ?? {}).map((s) => s?.filename)].filter((n): n is string => Boolean(n));
  // Payload never upscales. After the rotation the photo is 800 px wide, so only the 480 size fits.
  check('original and the sizes that fit were written', stored.length === 2, `${stored.length} files`);

  for (const name of stored) {
    const buf = await fs.readFile(path.join(mediaDir, name));
    const found = scanImage(buf, path.extname(name).toLowerCase());
    check(`${name}: no GPS`, !found.gps);
    check(`${name}: no metadata blocks`, found.metadata.length === 0, found.metadata.join(','));
  }

  // Orientation was applied to the pixels (6 = rotate 90 degrees), so a 1200x800 photo is stored 800x1200.
  const meta = await sharp(await fs.readFile(path.join(mediaDir, doc.filename as string))).metadata();
  check('orientation applied to pixels', meta.width === 800 && meta.height === 1200, `${meta.width}x${meta.height}`);

  let svgRefused = false;
  try {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>1</script></svg>');
    await payload.create({
      collection: 'media',
      locale: 'en',
      data: { alt: 'svg' } as never,
      file: { data: svg, mimetype: 'image/svg+xml', name: 'x.svg', size: svg.length },
    });
  } catch {
    svgRefused = true;
  }
  check('SVG upload is refused', svgRefused);

  await payload.delete({ collection: 'media', id: doc.id });
  const left = await fs.readdir(mediaDir);
  check('test files removed from disk', !left.some((n) => n.startsWith('privacy-check')));
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
console.log(failed ? `check:privacy: ${failed} failed` : 'check:privacy: all passed');
process.exit(failed ? 1 : 0);
