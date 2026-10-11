// The mapper is checked against a captured, real Payload response (tests/fixtures/payload-raw.json), written by
// `node scripts/pull-cms.mjs --raw tests/fixtures/payload-raw.json` against the seeded local CMS. If the CMS schema
// changes shape, re-capture it and these tests show exactly what moved.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as cmsMap from '../scripts/lib/cms-map.mjs';
import { hasPage } from '~/lib/cms';
import type { Post } from '~/lib/types';

// The mapper is plain JS, so TypeScript infers narrow types from its code. Here it handles arbitrary JSON.
const { createContext, isEmptyLexical, localized, mapAll, mapMedia, mapPost } = cmsMap as unknown as Record<
  string,
  (...args: any[]) => any
>;

const raw = JSON.parse(readFileSync(new URL('./fixtures/payload-raw.json', import.meta.url), 'utf8'));
const fixtureDir = new URL('../src/content/fixtures/', import.meta.url);
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
  const { media, downloads } = mapMedia(doc);
  it('keys sizes by width and serves them from /media', () => {
    expect(Object.keys(media.sizes).sort()).toEqual(['1600', '480', '960']);
    expect(media.sizes['480'].url).toMatch(/^\/media\/cover-tech-480x\d+\.webp$/);
  });
  it('keeps alt text per locale and a credit', () => {
    expect(media.alt.en).toBeTruthy();
    expect(media.alt.ja).toBeTruthy();
    expect(media.credit).toMatch(/Unsplash/);
  });
  it('downloads the sizes only (the site never prints the original)', () => {
    expect(downloads.map((d: { name: string }) => d.name).sort()).toEqual(
      Object.values(media.sizes as Record<string, { url: string }>)
        .map((s) => s.url.replace('/media/', ''))
        .sort(),
    );
    expect(media.url).toBe(media.sizes['1600'].url);
  });
  it('refuses a filename that could escape the media folder', () => {
    expect(() => mapMedia({ ...doc, sizes: { w480: { ...doc.sizes.w480, filename: '../../etc/passwd' } } })).toThrow(/unsafe/);
  });
});

describe('mapAll() on the captured response', () => {
  const { files, downloads, counts } = mapAll(raw);

  it('produces the same posts the fixtures describe', () => {
    for (const name of readdirSync(new URL('posts/', fixtureDir))) {
      const mapped = files.get(`posts/${name}`);
      const expected = fixture(`posts/${name}`);
      expect(mapped, name).toBeDefined();
      expect(mapped.slug).toBe(expected.slug);
      expect(mapped._status).toBe(expected._status);
      expect(mapped.title).toEqual(expected.title);
      expect(mapped.description).toEqual(expected.description);
      // media objects are rebuilt from the media collection (different ids and URLs by design): compare the rest
      expect(withoutMedia(mapped.content)).toEqual(withoutMedia(expected.content));
    }
  });

  it('keeps a Japanese-only post Japanese-only', () => {
    const post = files.get('posts/homelab-de-blog-wo-unyo-suru.json') as Post;
    expect(post.title.en).toBeUndefined();
    expect(post.content.en).toBeUndefined();
    expect(hasPage(post, 'en')).toBe(false);
    expect(hasPage(post, 'ja')).toBe(true);
  });

  it('keeps an English-only post English-only, even though Japanese text exists in its fields', () => {
    const post = files.get('posts/how-this-site-is-built.json') as Post;
    expect(post.publishedIn).toEqual({ en: true, ja: false });
    expect(hasPage(post, 'ja')).toBe(false);
  });

  it('resolves figure and photo-strip media to full objects with alt text in both languages', () => {
    const post = files.get('posts/japanese-paperwork-vocabulary.json');
    const blocks = post.content.en.root.children.filter((n: { type: string }) => n.type === 'block');
    const figure = blocks.find((b: { fields: { blockType: string } }) => b.fields.blockType === 'figure');
    expect(figure.fields.media.alt).toMatchObject({ en: expect.any(String), ja: expect.any(String) });
    expect(figure.fields.media.url).toMatch(/^\/media\//);
    const strip = blocks.find((b: { fields: { blockType: string } }) => b.fields.blockType === 'gallery-strip');
    expect(strip.fields.media).toHaveLength(3);
  });

  it('never downloads media used only by an unpublished post', () => {
    const draft = files.get('posts/unfinished-draft.json');
    expect(draft._status).toBe('draft');
    expect(counts.publishedPosts).toBe(4);
    expect(downloads.length).toBeGreaterThan(0);
  });

  it('flattens array-of-object fields the site models as string lists', () => {
    expect(files.get('projects/homelab.json').stack).toContain('Kubernetes');
    expect(files.get('resume.json').work[0].highlights).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(typeof files.get('resume.json').skills[0].keywords[0]).toBe('string');
  });
});

describe('the locale rule survives the CMS (Phase 2 gate)', () => {
  const slug = 'japanese-paperwork-vocabulary';
  const pageIn = (data: typeof raw, locale: 'en' | 'ja') => hasPage(mapAll(data).files.get(`posts/${slug}.json`) as Post, locale);

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

describe('errors that must stop a build', () => {
  it('a published post pointing at deleted media is an error', () => {
    const broken = structuredClone(raw);
    broken.media = broken.media.filter((m: { filename: string }) => m.filename !== 'cover-tech.jpg');
    expect(() => mapAll(broken)).toThrow(/media \d+ does not exist/);
  });
  it('a draft pointing at deleted media is tolerated (it is never rendered)', () => {
    const ok = structuredClone(raw);
    const ctx = createContext(ok);
    const draft = { ...ok.posts.find((p: { _status: string }) => p._status === 'draft'), hero: 99999 };
    expect(() => mapPost(ctx, draft)).not.toThrow();
  });
  it('duplicate slugs are an error', () => {
    const dup = structuredClone(raw);
    dup.posts.push(structuredClone(dup.posts[0]));
    expect(() => mapAll(dup)).toThrow(/duplicate post slug/);
  });
});
