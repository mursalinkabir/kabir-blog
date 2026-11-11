/** The post tools: write, check and publish posts in English and Japanese. */
import { z } from 'zod';
import { autoPublishEnabled, MAX_DESCRIPTION, MAX_TITLE, publishProblems } from '../lib/agentPolicy';
import { markdownToLexical, preservedBlocks } from '../lib/markdown';
import {
  adminUrl,
  as,
  asWrite,
  assertFresh,
  CATEGORIES,
  categoryId,
  define,
  detectImage,
  docId,
  expectedUpdatedAt,
  fetchImage,
  language,
  loadPost,
  LOCALES,
  MAX_IMAGE_BYTES,
  slugShape,
  tagIds,
  view,
  reportLive,
} from './shared';

export const postTools = [
  define(
    'list_posts',
    'List posts (newest first) with their id, slug, status and which languages have a title. Use it to avoid duplicates.',
    { status: z.enum(['draft', 'published']).optional(), limit: z.number().int().min(1).max(50).default(20) },
    async (a, ctx) => {
      const res = await ctx.payload.find({
        collection: 'posts',
        limit: a.limit,
        sort: '-updatedAt',
        depth: 0,
        draft: true,
        locale: 'all',
        where: a.status ? { _status: { equals: a.status } } : undefined,
        ...as(ctx),
      });
      return res.docs.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        status: p._status,
        createdByAgent: Boolean(p.createdByAgent),
        title: { en: p.title?.en ?? null, ja: p.title?.ja ?? null },
        visible: { en: Boolean(p.publishedIn?.en), ja: Boolean(p.publishedIn?.ja) },
        updatedAt: p.updatedAt,
      }));
    },
    'posts',
  ),

  define(
    'get_post',
    'Read one post, in both languages, as Markdown you can edit and send back with update_draft.',
    { id: docId },
    async (a, ctx) => {
      const out: Record<string, unknown> = {};
      let base: Record<string, any> | undefined;
      for (const l of LOCALES) {
        const p = await loadPost(ctx, a.id, l);
        base ??= p;
        out[l] = view(p, l);
      }
      return {
        id: a.id,
        slug: base!.slug,
        status: base!._status,
        category: base!.category?.slug ?? null,
        tags: (base!.tags ?? []).map((t: any) => t.slug),
        pubDate: base!.pubDate,
        updatedDate: base!.updatedDate ?? null,
        hero: base!.hero ? { id: base!.hero.id ?? base!.hero, alt: base!.hero.alt ?? null } : null,
        series: base!.series?.name ? base!.series : null,
        toc: base!.toc,
        createdByAgent: Boolean(base!.createdByAgent),
        updatedAt: base!.updatedAt,
        ...out,
        adminUrl: adminUrl(a.id, 'en'),
        note: '[[keep:ID]] lines are blocks Markdown cannot express; leave them exactly where they are.',
      };
    },
    'posts',
  ),

  define(
    'create_draft',
    'Create a new post as a DRAFT in one language. It is not public. Add the other language later with update_draft.',
    {
      language,
      title: z.string().min(3).max(MAX_TITLE),
      description: z.string().min(10).max(MAX_DESCRIPTION),
      slug: slugShape.describe('Part of the public URL, permanent once published. English words, e.g. why-i-run-a-homelab'),
      category: z.enum(CATEGORIES),
      tags: z
        .array(z.object({ slug: slugShape, name: z.string().min(1).max(40).optional() }))
        .max(8)
        .default([]),
      markdown: z.string().min(1).max(100_000),
      series: z.object({ name: z.string().min(1).max(80), part: z.number().int().min(1) }).optional(),
    },
    async (a, ctx) => {
      const content = markdownToLexical(a.markdown);
      const doc = await ctx.payload.create({
        collection: 'posts',
        locale: a.language,
        draft: true,
        data: {
          title: a.title,
          description: a.description,
          slug: a.slug,
          category: await categoryId(ctx, a.category),
          tags: await tagIds(ctx, a.tags, a.language),
          pubDate: new Date().toISOString(),
          toc: true,
          publishedIn: false,
          content,
          series: a.series,
          _status: 'draft',
        } as never,
        ...as(ctx),
      });
      return {
        id: doc.id,
        slug: a.slug,
        status: 'draft',
        language: a.language,
        updatedAt: doc.updatedAt,
        adminUrl: adminUrl(doc.id, a.language),
        next: 'check_post, then publish_post (or ask a person to publish).',
      };
    },
    'posts',
  ),

  define(
    'update_draft',
    'Change one language of any post (or add a language to it). Send only what changes; markdown replaces the whole text. Needs expected_updated_at from get_post.',
    {
      id: docId,
      expected_updated_at: expectedUpdatedAt,
      language,
      title: z.string().min(3).max(MAX_TITLE).optional(),
      description: z.string().min(10).max(MAX_DESCRIPTION).optional(),
      markdown: z.string().min(1).max(100_000).optional(),
      tags: z
        .array(z.object({ slug: slugShape, name: z.string().min(1).max(40).optional() }))
        .max(8)
        .optional(),
      visible: z
        .boolean()
        .optional()
        .describe('Show or hide this language on the site the next time the post is published. No effect until then.'),
      category: z.enum(CATEGORIES).optional(),
      hero: z.union([docId, z.null()]).optional().describe('Cover image: a media id from upload_image or list_media; null removes it.'),
      series: z
        .object({ name: z.string().min(1).max(80), part: z.number().int().min(1) })
        .nullable()
        .optional(),
      toc: z.boolean().optional().describe('Show a contents list.'),
      pubDate: z.string().datetime().optional().describe('ISO date-time shown as the publication date.'),
      updatedDate: z.string().datetime().nullable().optional().describe('Set only when readers should be told the post changed.'),
    },
    async (a, ctx) => {
      const existing = await loadPost(ctx, a.id, a.language);
      assertFresh(a.expected_updated_at, existing.updatedAt);
      const data: Record<string, unknown> = {};
      if (a.title !== undefined) data.title = a.title;
      if (a.description !== undefined) data.description = a.description;
      if (a.markdown !== undefined) data.content = markdownToLexical(a.markdown, { preserved: preservedBlocks(existing.content) });
      if (a.tags !== undefined) data.tags = await tagIds(ctx, a.tags, a.language);
      if (a.visible !== undefined) data.publishedIn = a.visible;
      if (a.category !== undefined) data.category = await categoryId(ctx, a.category);
      if (a.hero !== undefined) data.hero = a.hero;
      if (a.series !== undefined) data.series = a.series ?? { name: null, part: null };
      if (a.toc !== undefined) data.toc = a.toc;
      if (a.pubDate !== undefined) data.pubDate = a.pubDate;
      if (a.updatedDate !== undefined) data.updatedDate = a.updatedDate;
      if (!Object.keys(data).length)
        throw new Error('Nothing to change: send at least one field besides id, language and expected_updated_at.');
      const saved = await ctx.payload.update({
        collection: 'posts',
        id: a.id,
        locale: a.language,
        draft: true,
        data: data as never,
        ...asWrite(ctx),
      });
      return { id: a.id, language: a.language, changed: Object.keys(data), status: 'draft saved (not public)', updatedAt: saved.updatedAt };
    },
    'posts',
  ),

  define(
    'upload_image',
    'Upload one picture (JPEG, PNG, WebP or AVIF, up to 8 MB). Location data is stripped. Alt text in BOTH languages is required.',
    {
      filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/, 'letters, digits, dot, dash, underscore'),
      data_base64: z.string().optional().describe('The file, base64-encoded. Use for small images.'),
      url: z.string().url().optional().describe('An https URL on an allowed image host (default: images.unsplash.com).'),
      alt_en: z.string().min(3).max(200),
      alt_ja: z.string().min(3).max(200),
      credit: z.string().max(200).optional().describe('For example "Photo: Name on Unsplash". Required for photos you did not take.'),
    },
    async (a, ctx) => {
      if (!a.data_base64 === !a.url) throw new Error('Send exactly one of data_base64 or url.');
      const buf = a.data_base64 ? Buffer.from(a.data_base64, 'base64') : await fetchImage(a.url!);
      if (buf.length > MAX_IMAGE_BYTES) throw new Error('The image is larger than 8 MB.');
      const kind = detectImage(buf);
      if (!kind) throw new Error('This is not a JPEG, PNG, WebP or AVIF image (SVG and HEIC are refused).');
      const name = a.filename.replace(/\.[A-Za-z0-9]+$/, '') + '.' + kind.ext;
      const created = await ctx.payload.create({
        collection: 'media',
        locale: 'en',
        data: { alt: a.alt_en, credit: a.credit } as never,
        file: { data: buf, mimetype: kind.mime, name, size: buf.length },
        ...as(ctx),
      });
      await ctx.payload.update({ collection: 'media', id: created.id, locale: 'ja', data: { alt: a.alt_ja } as never, ...as(ctx) });
      return { id: created.id, filename: (created as any).filename, use: `![](media:${created.id} "Caption")` };
    },
    'posts',
  ),

  define(
    'check_post',
    'Dry run of the publish rules for one language. Returns the list of problems (empty = it may be published). Changes nothing.',
    { id: docId, language },
    async (a, ctx) => {
      const p = await loadPost(ctx, a.id, a.language);
      const hero = p.hero && typeof p.hero === 'object' ? p.hero : undefined;
      const problems = publishProblems({
        locale: a.language,
        title: p.title,
        description: p.description,
        slug: p.slug,
        content: p.content,
        publishedIn: true,
        hasCategory: Boolean(p.category),
        coverHasAlt: hero ? Boolean(hero.alt && String(hero.alt).trim()) : undefined,
        // Blocks already in the stored draft were put there by a person (the save hook refuses an agent's new ones).
        baseline: p.content,
      });
      return {
        id: a.id,
        language: a.language,
        canPublish: problems.length === 0 && autoPublishEnabled(),
        autoPublish: autoPublishEnabled(),
        problems,
      };
    },
    'posts',
  ),

  define(
    'publish_post',
    'Publish one or both languages of a post. Every language that will be visible must pass the rules; if one fails, nothing changes and the reasons are returned.',
    { id: docId, languages: z.array(language).min(1).max(2), expected_updated_at: expectedUpdatedAt },
    async (a, ctx) => {
      const results: Record<string, unknown> = {};
      assertFresh(a.expected_updated_at, (await loadPost(ctx, a.id, a.languages[0])).updatedAt);
      for (const l of a.languages) {
        const p = await loadPost(ctx, a.id, l);
        // Publishing sends the whole current draft, so the live copy is exactly what check_post just judged.
        const data = {
          title: p.title,
          description: p.description,
          slug: p.slug,
          content: p.content,
          category: p.category?.id ?? p.category,
          tags: (p.tags ?? []).map((t: any) => t.id ?? t),
          hero: p.hero?.id ?? p.hero ?? undefined,
          series: p.series,
          toc: p.toc,
          pubDate: p.pubDate,
          publishedIn: true,
          _status: 'published',
        };
        try {
          await ctx.payload.update({ collection: 'posts', id: a.id, locale: l, draft: false, data: data as never, ...asWrite(ctx) });
          results[l] = { published: true };
        } catch (error) {
          results[l] = { published: false, reason: error instanceof Error ? error.message : String(error) };
        }
      }
      const slug = (await loadPost(ctx, a.id, a.languages[0])).slug as string;
      const where = await reportLive('posts', slug);
      return {
        id: a.id,
        results,
        ...where,
        note: 'A publish is live within about a second. `live` lists the addresses; `notLive` says what is missing in a language that is not live.',
      };
    },
    'posts',
  ),

  define(
    'unpublish_post',
    'Take a post OFF the site entirely (both languages). It stays as a draft you can edit and publish again. Never blocked.',
    { id: docId },
    async (a, ctx) => {
      // The whole post goes back to draft. A single language cannot be taken down on its own: Payload publishes the
      // whole latest draft on any non-draft save, which could put an unreviewed edit in the other language live.
      await ctx.payload.update({
        collection: 'posts',
        id: a.id,
        locale: 'en',
        draft: false,
        data: { _status: 'draft' } as never,
        ...asWrite(ctx),
      });
      return {
        id: a.id,
        status: 'draft',
        live: false,
        tip: 'To bring back one language only: update_draft with visible:false on the other, then publish_post.',
      };
    },
    'posts',
  ),
];
