import sharp, { type Sharp } from 'sharp';
import type { CollectionBeforeOperationHook } from 'payload';

const REENCODE: Record<string, (s: Sharp) => Sharp> = {
  'image/jpeg': (s) => s.jpeg({ quality: 92, mozjpeg: true }),
  'image/png': (s) => s.png({ compressionLevel: 9 }),
  'image/webp': (s) => s.webp({ quality: 90 }),
  'image/avif': (s) => s.avif({ quality: 70 }),
};

/**
 * Privacy guardrail (docs/PLAN.md, "Privacy guardrails"): a phone photo carries GPS in its EXIF block, and Payload
 * stores the uploaded original untouched. The generated sizes are already stripped (`withMetadata` defaults to
 * false), but the original is not. This re-encodes the upload before storage: orientation is applied first
 * (`rotate()`), then every metadata block (EXIF, GPS, XMP, IPTC, ICC) is dropped, because sharp writes none unless
 * asked. It runs on create and update, before anything is written to disk or R2.
 *
 * Anything sharp cannot decode (HEIC from an iPhone's default setting, for instance) is rejected with a message
 * that says what to do, rather than stored with its location intact.
 */
export const stripImageMetadata: CollectionBeforeOperationHook = async ({ req, operation }) => {
  if ((operation !== 'create' && operation !== 'update') || !req.file) return;

  const mime = req.file.mimetype;
  const encode = REENCODE[mime];
  if (!encode) {
    throw new Error(
      `"${req.file.name}" is ${mime || 'an unsupported type'}. Upload a JPEG, PNG, WebP or AVIF. ` +
        `On an iPhone: Settings > Camera > Formats > Most Compatible, or export the photo as JPEG first.`,
    );
  }

  try {
    req.file.data = await encode(sharp(req.file.data, { failOn: 'error' }).rotate()).toBuffer();
    req.file.size = req.file.data.length;
  } catch (error) {
    throw new Error(`"${req.file.name}" could not be read as an image (${(error as Error).message}).`);
  }
};
