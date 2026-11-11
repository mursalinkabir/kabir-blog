/** Tags, category names and image details: the words around the content, in both languages. */
import { z } from 'zod';
import { as, asWrite, CATEGORIES, define, docId, language, mediaLink, slugShape } from './shared';

export const taxonomyTools = [
  define(
    'list_tags',
    'Every tag with its slug and its name in each language (null = not named in that language, so not listed there).',
    {},
    async (_a, ctx) => {
      const res = await ctx.payload.find({ collection: 'tags', limit: 500, depth: 0, locale: 'all', sort: 'slug', ...as(ctx) });
      return res.docs.map((t: any) => ({ id: t.id, slug: t.slug, name: { en: t.name?.en ?? null, ja: t.name?.ja ?? null } }));
    },
    'tags',
  ),
  define(
    'update_tag',
    'Name (or rename) a tag in one language. The slug is permanent. Use it to add the Japanese name of a tag created in English.',
    { slug: slugShape, language, name: z.string().min(1).max(40) },
    async (a, ctx) => {
      const found = await ctx.payload.find({ collection: 'tags', where: { slug: { equals: a.slug } }, limit: 1, depth: 0, ...as(ctx) });
      if (!found.docs[0]) throw new Error(`Tag "${a.slug}" does not exist (list_tags shows them).`);
      await ctx.payload.update({
        collection: 'tags',
        id: found.docs[0].id,
        locale: a.language,
        data: { name: a.name } as never,
        ...asWrite(ctx),
      });
      return { slug: a.slug, language: a.language, name: a.name };
    },
    'tags',
  ),
  define(
    'list_categories',
    'The three categories with their slug and name in each language. New categories are an admin and site change.',
    {},
    async (_a, ctx) => {
      const res = await ctx.payload.find({ collection: 'categories', limit: 20, depth: 0, locale: 'all', ...as(ctx) });
      return res.docs.map((c: any) => ({ id: c.id, slug: c.slug, name: { en: c.name?.en ?? null, ja: c.name?.ja ?? null } }));
    },
    'categories',
  ),
  define(
    'update_category_name',
    'Change how a category is named in one language. The slug cannot change.',
    { slug: z.enum(CATEGORIES), language, name: z.string().min(1).max(60) },
    async (a, ctx) => {
      const found = await ctx.payload.find({
        collection: 'categories',
        where: { slug: { equals: a.slug } },
        limit: 1,
        depth: 0,
        ...as(ctx),
      });
      if (!found.docs[0]) throw new Error(`Category "${a.slug}" does not exist.`);
      await ctx.payload.update({
        collection: 'categories',
        id: found.docs[0].id,
        locale: a.language,
        data: { name: a.name } as never,
        ...asWrite(ctx),
      });
      return { slug: a.slug, language: a.language, name: a.name };
    },
    'categories',
  ),
  define(
    'list_media',
    'Uploaded images, newest first, with alt text in each language, caption and credit. Use the id as a cover image or in ![](media:ID).',
    { limit: z.number().int().min(1).max(100).default(30), search: z.string().max(80).optional().describe('Part of the file name.') },
    async (a, ctx) => {
      const res = await ctx.payload.find({
        collection: 'media',
        limit: a.limit,
        sort: '-createdAt',
        depth: 0,
        locale: 'all',
        where: a.search ? { filename: { contains: a.search } } : undefined,
        ...as(ctx),
      });
      return res.docs.map((m: any) => ({
        ...mediaLink(m.id),
        filename: m.filename,
        alt: { en: m.alt?.en ?? null, ja: m.alt?.ja ?? null },
        caption: { en: m.caption?.en ?? null, ja: m.caption?.ja ?? null },
        credit: m.credit ?? null,
      }));
    },
    'media',
  ),
  define(
    'update_media',
    'Change the alt text or caption of an image in one language, or its credit. The image file itself cannot be replaced: upload a new one instead.',
    {
      id: docId,
      language,
      alt: z.string().min(3).max(200).optional(),
      caption: z.string().max(300).optional(),
      credit: z.string().max(200).optional(),
    },
    async (a, ctx) => {
      const data: Record<string, unknown> = {};
      if (a.alt !== undefined) data.alt = a.alt;
      if (a.caption !== undefined) data.caption = a.caption;
      if (a.credit !== undefined) data.credit = a.credit;
      if (!Object.keys(data).length) throw new Error('Nothing to change: send alt, caption or credit.');
      await ctx.payload.update({ collection: 'media', id: a.id, locale: a.language, data: data as never, ...asWrite(ctx) });
      return { id: a.id, language: a.language, changed: Object.keys(data) };
    },
    'media',
  ),
];
