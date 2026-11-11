// The mapper is checked against a captured, real Payload response (tests/fixtures/payload-raw.json), written by
// `node scripts/pull-cms.mjs --raw tests/fixtures/payload-raw.json` against the seeded local CMS. If the CMS schema
// changes shape, re-capture it and these tests show exactly what moved.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createContext, isEmptyLexical, localized, mapAll as mapAllRaw, mapMedia, mapPost } from '../src/site/data/map';
import { hasPage } from '../src/site/data/site';
import type { Post } from '../src/site/lib/types';

const mapAll = (r: unknown) => mapAllRaw(r as never);

const raw = JSON.parse(readFileSync(new URL('./fixtures/payload-raw.json', import.meta.url), 'utf8'));
const fixtureDir = new URL('../../site/src/content/fixtures/', import.meta.url);
const fixture = (path: string) => JSON.parse(readFileSync(new URL(path, fixtureDir), 'utf8'));

const withoutMedia = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'media' ? undefined : x)));

describe('localized()', () => {
  it('drops null, empty and missing locales instead of filling them', () => {
    expect(localized({ en: 'Hi', ja: null })).toEqual({ en: 'Hi' });
    expect(localized({ en: '', ja: 'こんにちは' })).toEqual({ ja: 'こんにちは' });
    expect(localized({ en: null, ja: null })).toBeUndefined();
    expect(localized(undefined)).toBeUndefined();
  });
});

describe('isEmptyLexical()', () => {
  const paragraph = (text?: string) => ({ type: 'paragraph', children: text ? [{ type: 'text', text }] : [] });
  it('treats an untouched editor as empty', () => {
    expect(isEmptyLexical({ root: { children: [paragraph()] } })).toBe(true);
    expect(isEmptyLexical({ root: { children: [paragraph('  ')] } })).toBe(true);
    expect(isEmptyLexical(null)).toBe(true);
  });
  it('counts text and blocks as content', () => {
    expect(isEmptyLexical({ root: { children: [paragraph('x')] } })).toBe(false);
    expect(isEmptyLexical({ root: { children: [{ type: 'block', fields: { blockType: 'code' } }] } })).toBe(false);
  });
});

describe('mapMedia()', () => {
  const doc = raw.media.find((m: { filename: string }) => m.filename === 'cover-tech.jpg');
  const media = mapMedia(doc);
  it('keys sizes by width and keeps the URLs Payload returned', () => {
    expect(Object.keys(media.sizes).sort()).toEqual(['1600', '480', '960']);
    expect(media.sizes['480'].url).toMatch(/^\/api\/media\/file\/cover-tech-480x\d+\.webp$/);
  });
  it('takes media URLs from Payload, not from the filename', () => {
    const m = mapMedia({ ...doc, sizes: { w480: { ...doc.sizes.w480, url: 'https://media.example/a-480.webp' } } });
    expect(m.sizes['480'].url).toBe('https://media.example/a-480.webp');
  });
  it('keeps alt text per locale and a credit', () => {
    expect(media.alt.en).toBeTruthy();
    expect(media.alt.ja).toBeTruthy();
    expect(media.credit).toMatch(/Unsplash/);
  });
  it('points url at the largest generated size, never the original', () => {
    expect(media.url).toBe(media.sizes['1600'].url);
  });
  it('refuses a filename that could escape the media folder', () => {
    expect(() => mapMedia({ ...doc, sizes: { w480: { ...doc.sizes.w480, filename: '../../etc/passwd' } } })).toThrow(/unsafe/);
  });
});

describe('mapAll() on the captured response', () => {
  const { data, errors } = mapAll(raw);
  const post = (slug: string) => data.posts.find((p) => p.slug === slug) as Post;

  it('maps everything without errors', () => expect(errors).toEqual([]));

  it('produces the same posts the fixtures describe', () => {
    for (const name of readdirSync(new URL('posts/', fixtureDir))) {
      const expected = fixture(`posts/${name}`);
      const mapped = post(expected.slug);
      expect(
        mapped,
        `${name} is a fixture but is missing from the captured CMS response. Re-capture it: seed a local CMS ` +
          `(SEED_RESET=1 pnpm cms:seed), then in apps/site run  node scripts/pull-cms.mjs --raw tests/fixtures/payload-raw.json`,
      ).toBeDefined();
      expect(mapped._status).toBe(expected._status);
      expect(mapped.title).toEqual(expected.title);
      expect(mapped.description).toEqual(expected.description);
      // media objects are rebuilt from the media collection (different ids and URLs by design): compare the rest
      expect(withoutMedia(mapped.content)).toEqual(withoutMedia(expected.content));
    }
  });

  it('keeps a Japanese-only post Japanese-only', () => {
    const p = post('homelab-de-blog-wo-unyo-suru');
    expect(p.title.en).toBeUndefined();
    expect(p.content.en).toBeUndefined();
    expect(hasPage(p, 'en')).toBe(false);
    expect(hasPage(p, 'ja')).toBe(true);
  });

  it('keeps an English-only post English-only, even though Japanese text exists in its fields', () => {
    const source = raw.posts.find((p: { slug: string }) => p.slug === 'how-this-site-is-built');
    const p = mapPost(createContext(raw), { ...source, publishedIn: { en: true, ja: false } }) as Post;
    expect(p.title.ja).toBeTruthy();
    expect(p.publishedIn).toEqual({ en: true, ja: false });
    expect(hasPage(p, 'en')).toBe(true);
    expect(hasPage(p, 'ja')).toBe(false);
  });

  it('resolves figure and photo-strip media to full objects with alt text in both languages', () => {
    const blocks = (post('japanese-paperwork-vocabulary').content.en!.root.children as any[]).filter((n) => n.type === 'block');
    const figure = blocks.find((b) => b.fields.blockType === 'figure');
    expect(figure.fields.media.alt).toMatchObject({ en: expect.any(String), ja: expect.any(String) });
    const strip = blocks.find((b) => b.fields.blockType === 'gallery-strip');
    expect(strip.fields.media).toHaveLength(3);
  });

  it('keeps drafts in the data (they are never listed: see siteData tests)', () => {
    expect(post('unfinished-draft')._status).toBe('draft');
  });

  it('flattens array-of-object fields the site models as string lists', () => {
    expect(data.projects.find((p) => p.slug === 'homelab')!.stack).toContain('Kubernetes');
    expect(data.resume.work[0]!.highlights).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(typeof data.resume.skills[0]!.keywords[0]).toBe('string');
  });
});

describe('the locale rule survives the CMS (Phase 2 gate)', () => {
  const slug = 'japanese-paperwork-vocabulary';
  const pageIn = (data: typeof raw, locale: 'en' | 'ja') => hasPage(mapAll(data).data.posts.find((p) => p.slug === slug) as Post, locale);

  it('has both pages when every field is written', () => {
    expect(pageIn(raw, 'en')).toBe(true);
    expect(pageIn(raw, 'ja')).toBe(true);
  });
  it('loses only the Japanese page when the Japanese description is blanked', () => {
    const edited = structuredClone(raw);
    edited.posts.find((p: { slug: string }) => p.slug === slug).description.ja = '';
    expect(pageIn(edited, 'ja')).toBe(false);
    expect(pageIn(edited, 'en')).toBe(true);
  });
  it('loses the Japanese page when the Japanese text is an untouched editor', () => {
    const edited = structuredClone(raw);
    edited.posts.find((p: { slug: string }) => p.slug === slug).content.ja = {
      root: { type: 'root', children: [{ type: 'paragraph', children: [] }] },
    };
    expect(pageIn(edited, 'ja')).toBe(false);
  });
  it('loses the Japanese page when the cover has no Japanese alt text', () => {
    const edited = structuredClone(raw);
    const hero = edited.posts.find((p: { slug: string }) => p.slug === slug).hero;
    edited.media.find((m: { id: number }) => m.id === hero).alt.ja = null;
    expect(pageIn(edited, 'ja')).toBe(false);
    expect(pageIn(edited, 'en')).toBe(true);
  });
});

describe('a broken document never takes the site down', () => {
  it('skips one post that cannot be mapped and keeps the rest', () => {
    const broken = structuredClone(raw);
    broken.posts[0].category = 999999;
    const { data, errors } = mapAll(broken);
    expect(data.posts).toHaveLength(raw.posts.length - 1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^posts\/\S+: /);
  });
  it('a published post pointing at deleted media is reported and skipped', () => {
    const broken = structuredClone(raw);
    broken.media = broken.media.filter((m: { filename: string }) => m.filename !== 'cover-tech.jpg');
    const { errors } = mapAll(broken);
    expect(errors.some((e) => /media \d+ does not exist/.test(e))).toBe(true);
  });
  it('a draft pointing at deleted media is tolerated (it is never rendered)', () => {
    const ctx = createContext(raw);
    const draft = { ...raw.posts.find((p: { _status: string }) => p._status === 'draft'), hero: 99999 };
    expect(() => mapPost(ctx, draft)).not.toThrow();
  });
  it('keeps the first of two posts with the same slug and reports the second', () => {
    const dup = structuredClone(raw);
    dup.posts.push(structuredClone(dup.posts[0]));
    const { data, errors } = mapAll(dup);
    expect(data.posts).toHaveLength(raw.posts.length);
    expect(errors[0]).toMatch(/duplicate slug/);
  });
  it('a global that fails to map is reported and replaced by a safe empty value', () => {
    const broken = structuredClone(raw);
    broken.globals.now = null;
    const { data, errors } = mapAll(broken);
    expect(errors.some((e) => e.startsWith('globals/now:'))).toBe(true);
    expect(data.now).toBeDefined();
  });
});
