import { describe, expect, it } from 'vitest';
import { scanImage, scanText } from '../../../scripts/privacy-scan.mjs';

/** Smallest JPEG that carries an Exif block; `gps` adds the GPSInfo pointer (tag 0x8825) to IFD0. */
function jpegWithExif(gps: boolean): Buffer {
  const entries = gps ? [[0x8825, 4, 1, 26]] : [[0x0112, 3, 1, 1]];
  const tiff = Buffer.alloc(8 + 2 + entries.length * 12 + 4);
  tiff.write('MM');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(entries.length, 8);
  entries.forEach(([tag, type, count, value], i) => {
    const o = 10 + i * 12;
    tiff.writeUInt16BE(tag!, o);
    tiff.writeUInt16BE(type!, o + 2);
    tiff.writeUInt32BE(count!, o + 4);
    tiff.writeUInt32BE(value!, o + 8);
  });
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), head, exif, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}

describe('privacy scan', () => {
  it('flags GPS in Exif but not other Exif', () => {
    expect(scanImage(jpegWithExif(true), '.jpg')).toMatchObject({ gps: true });
    expect(scanImage(jpegWithExif(false), '.jpg')).toMatchObject({ gps: false, metadata: ['Exif'] });
  });
  it('passes a JPEG with no metadata segments', () => {
    const bare = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(scanImage(bare, '.jpg')).toEqual({ gps: false, metadata: [] });
  });
  it('flags personal data patterns but allows the site address, versions and dates', () => {
    expect(scanText('mail me: someone@example.com')).toEqual(['email someone@example.com']);
    expect(scanText('hello@smkabir.com')).toEqual([]);
    expect(scanText('1818238+someone@users.noreply.github.com')).toEqual([]); // GitHub no-reply: made to be public
    expect(scanText('someone@gmail.com')).toEqual(['email someone@gmail.com']);
    expect(scanText('git remote add origin git@github.com:owner/repo.git')).toEqual([]);
    expect(scanText('call 090-1234-5678')).toHaveLength(1);
    expect(scanText('call 090-1234-5678.')).toHaveLength(1); // at the end of a sentence
    expect(scanText('Phone: +81 90 1234 5678, then')).toHaveLength(1);
    expect(scanText('version 1.20.3.4 and 2026-10-12.')).toEqual([]);
    expect(scanText('viewBox="0 0 1600 900"')).toHaveLength(1); // prose rule: grouped digits look like a phone number
    expect(scanText('viewBox="0 0 1600 900" 090-1234-5678', [], { phones: false })).toEqual([]); // embeds: skipped
    expect(scanText('a@gmail.com 〒160-0022', [], { phones: false })).toHaveLength(2); // but the rest still applies
    expect(scanText('〒160-0022 and 3丁目')).toHaveLength(2);
    expect(scanText('pnpm@12.9.1, 2026-10-08, build 20261008, #01ad9f')).toEqual([]);
  });
  it('matches the denylist case-insensitively without echoing the term', () => {
    expect(scanText('I live near Secret Street', ['secret street'])).toEqual(['denylisted term (value withheld)']);
  });
});
