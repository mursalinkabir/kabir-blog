/**
 * The MCP tools an AI agent writes and publishes with. Registered through @payloadcms/plugin-mcp, served at
 * /api/mcp. Every call runs as the user the MCP key belongs to (an `agent` user) with `overrideAccess: false`, so the
 * collection access rules apply; the publish rules live in hooks/agentGuards.ts and apply to any use of that user,
 * not only to these tools.
 */
import { z } from 'zod';
import type { Payload, PayloadRequest } from 'payload';
import { roleOf } from '../access';
import { auditAgent } from '../hooks/agentGuards';
import {
  autoPublishEnabled,
  dailyLimit,
  defaultPolicy,
  MAX_DESCRIPTION,
  MAX_TITLE,
  publishProblems,
  type Locale,
} from '../lib/agentPolicy';
import { markdownFromLexical, markdownToLexical, MarkdownError, preservedBlocks, type LexicalRoot } from '../lib/markdown';

const LOCALES = ['en', 'ja'] as const;
const CATEGORIES = ['tech', 'finance', 'japan-life'] as const;
const language = z.enum(LOCALES).describe('en = English, ja = Japanese. Each language is its own text; nothing is translated for you.');
const slugShape = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single dashes')
  .max(80);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const imageHosts = () =>
  (process.env.AGENT_IMAGE_HOSTS ?? 'images.unsplash.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

type Reply = { content: { type: 'text'; text: string }[] };
const reply = (value: unknown): Reply => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

interface Ctx {
  payload: Payload;
  req: PayloadRequest;
  user: NonNullable<PayloadRequest['user']>;
}

/** Local API options that make Payload evaluate access rules for the agent user. */
const as = (ctx: Ctx) => ({ user: ctx.user, overrideAccess: false as const });

function define<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<unknown>,
) {
  const schema = z.object(shape);
  return {
    name,
    description,
    parameters: shape,
    handler: async (raw: Record<string, unknown>, req: PayloadRequest): Promise<Reply> => {
      const user = req.user;
      if (!user || roleOf(user) !== 'agent') return reply('ERROR: this key does not belong to an agent user.');
      const ctx: Ctx = { payload: req.payload, req, user };
      try {
        const args = schema.parse(raw);
        const result = await run(args, ctx);
        await auditAgent(req.payload, { tool: `mcp:${name}`, outcome: 'ok', userId: user.id, summary: name });
        return reply(result);
      } catch (error) {
        const message =
          error instanceof z.ZodError
            ? `Invalid arguments: ${error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`
            : error instanceof MarkdownError
              ? `Markdown problem: ${error.message}`
              : error instanceof Error
                ? error.message
                : String(error);
        await auditAgent(req.payload, {
          tool: `mcp:${name}`,
          outcome: 'error',
          userId: user.id,
          summary: message.split('\n')[0],
          detail: message,
        });
        return reply(`ERROR: ${message}`);
      }
    },
  };
}

async function categoryId(ctx: Ctx, slug: string): Promise<number | string> {
  const { docs } = await ctx.payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1, depth: 0, ...as(ctx) });
  if (!docs[0]) throw new Error(`Category "${slug}" does not exist.`);
  return docs[0].id;
}

async function tagIds(ctx: Ctx, tags: { slug: string; name?: string }[], locale: Locale): Promise<(number | string)[]> {
  const ids: (number | string)[] = [];
  for (const t of tags) {
    const { docs } = await ctx.payload.find({ collection: 'tags', where: { slug: { equals: t.slug } }, limit: 1, depth: 0, ...as(ctx) });
    if (docs[0]) {
      ids.push(docs[0].id);
      continue;
    }
    // A new tag is named in the language being written; the other language shows no tag until it is named.
    const created = await ctx.payload.create({
      collection: 'tags',
      locale,
      data: { slug: t.slug, name: t.name ?? t.slug } as never,
      ...as(ctx),
    });
    ids.push(created.id);
  }
  return ids;
}

async function loadPost(ctx: Ctx, id: number | string, locale: Locale) {
  return (await ctx.payload.findByID({
    collection: 'posts',
    id,
    locale,
    draft: true,
    depth: 1,
    fallbackLocale: false,
    ...as(ctx),
  })) as Record<string, any>;
}

const view = (p: Record<string, any>, locale: Locale) => ({
  language: locale,
  title: p.title ?? null,
  description: p.description ?? null,
  visibleInThisLanguage: Boolean(p.publishedIn),
  markdown: p.content ? markdownFromLexical(p.content as LexicalRoot) : '',
});

const adminUrl = (id: number | string, locale: Locale) =>
  `${process.env.CMS_PUBLIC_URL ?? 'http://localhost:3100'}/admin/collections/posts/${id}?locale=${locale}`;

function detectImage(buf: Buffer): { mime: string; ext: string } | undefined {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  if (buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp' && /avif|avis/.test(buf.toString('latin1', 8, 16)))
    return { mime: 'image/avif', ext: 'avif' };
  return undefined;
}

async function fetchImage(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Only https:// image URLs are accepted.');
  if (!imageHosts().includes(u.hostname.toLowerCase())) {
    throw new Error(`Images may only be fetched from: ${imageHosts().join(', ')}. Send the file as data_base64 instead.`);
  }
  // `redirect: 'error'`: a redirect could point anywhere, so it is not followed.
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`The image host answered ${res.status}.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error('The image is larger than 8 MB.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('The image is larger than 8 MB.');
  return buf;
}

const guide = (state: { autoPublish: boolean; limit: number; categories: string[]; tags: string[] }) => `
# Writing for smkabir.com (English and Japanese)

Status: auto-publishing is ${state.autoPublish ? 'ON' : 'OFF (drafts only; a person publishes in the admin)'}; at most ${state.limit} publishes per 24 hours (a post in two languages is two).

## Workflow
1. site_guide (this) and list_posts, so you do not repeat or contradict an existing post.
2. upload_image for each picture (alt text in BOTH languages is required; credit it).
3. create_draft for the first language. Add the other language later with update_draft (language = the other one).
4. check_post (dry run) for each language you intend to publish; fix every problem it lists.
5. publish_post. If it is refused it says why and nothing changes.

## Rules
- Categories: ${state.categories.join(', ')}. Existing tags: ${state.tags.slice(0, 40).join(', ') || '(none)'}.
- title <= ${MAX_TITLE} characters, description <= ${MAX_DESCRIPTION} characters (one sentence for cards and search).
- Write each language yourself. A language with a missing field simply has no page; there is no fallback to the other one.
- Minimum body: ${defaultPolicy().minChars.en} characters (English), ${defaultPolicy().minChars.ja} (Japanese).
- Never include a home address, phone number, personal email or family details, or a photo with a street sign, plate or face.
- Japanese terms inside English text: {{日本語|nihongo|meaning}} (Romaji always shown). On Japanese pages write normally.
- You can only change posts you created. You cannot delete, and you cannot add HTML embeds or photo strips.

## Markdown (CommonMark + GFM tables, task lists, ~~strike~~)
- Headings: ## and ###. A single # becomes ##. Do not repeat the title as a heading.
- Code: \`\`\`ts src/file.ts {2,4-6}   (language, optional filename, optional highlighted lines)
- Terminal: \`\`\`terminal  then the command, a line containing only ---, then the output
- Diagram: \`\`\`d2 alt="what it shows"
- Callout: a line ":::note Optional title" (or warn, danger), the text, a line ":::"
- Picture: ![](media:ID "Caption")   alone in its paragraph; ID comes from upload_image
- NOT allowed: raw HTML, remote images, javascript: links.
`;

export const agentTools = [
  define(
    'site_guide',
    'Read this first: the rules, limits, categories, tags and the Markdown dialect for writing posts.',
    {},
    async (_a, ctx) => {
      const cats = await ctx.payload.find({ collection: 'categories', limit: 20, depth: 0, ...as(ctx) });
      const tags = await ctx.payload.find({ collection: 'tags', limit: 200, depth: 0, ...as(ctx) });
      return guide({
        autoPublish: autoPublishEnabled(),
        limit: dailyLimit(),
        categories: cats.docs.map((c: any) => String(c.slug)),
        tags: tags.docs.map((t: any) => String(t.slug)),
      });
    },
  ),

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
  ),

  define(
    'get_post',
    'Read one post, in both languages, as Markdown you can edit and send back with update_draft.',
    { id: z.union([z.number(), z.string()]) },
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
        ownedByAgent: Boolean(base!.createdByAgent),
        ...out,
        adminUrl: adminUrl(a.id, 'en'),
        note: '[[keep:ID]] lines are blocks Markdown cannot express; leave them exactly where they are.',
      };
    },
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
        adminUrl: adminUrl(doc.id, a.language),
        next: 'check_post, then publish_post (or ask a person to publish).',
      };
    },
  ),

  define(
    'update_draft',
    'Change one language of a post you created (or add a language to it). Send only what changes; markdown replaces the whole text.',
    {
      id: z.union([z.number(), z.string()]),
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
    },
    async (a, ctx) => {
      const existing = await loadPost(ctx, a.id, a.language);
      const data: Record<string, unknown> = {};
      if (a.title !== undefined) data.title = a.title;
      if (a.description !== undefined) data.description = a.description;
      if (a.markdown !== undefined) data.content = markdownToLexical(a.markdown, { preserved: preservedBlocks(existing.content) });
      if (a.tags !== undefined) data.tags = await tagIds(ctx, a.tags, a.language);
      if (a.visible !== undefined) data.publishedIn = a.visible;
      if (!Object.keys(data).length) throw new Error('Nothing to change: send title, description, markdown, tags or visible.');
      await ctx.payload.update({ collection: 'posts', id: a.id, locale: a.language, draft: true, data: data as never, ...as(ctx) });
      return { id: a.id, language: a.language, changed: Object.keys(data), status: 'draft saved (not public)' };
    },
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
  ),

  define(
    'check_post',
    'Dry run of the publish rules for one language. Returns the list of problems (empty = it may be published). Changes nothing.',
    { id: z.union([z.number(), z.string()]), language },
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
      });
      return {
        id: a.id,
        language: a.language,
        canPublish: problems.length === 0 && autoPublishEnabled(),
        autoPublish: autoPublishEnabled(),
        problems,
      };
    },
  ),

  define(
    'publish_post',
    'Publish one or both languages of a post you created. Every language that will be visible must pass the rules; if one fails, nothing changes and the reasons are returned.',
    { id: z.union([z.number(), z.string()]), languages: z.array(language).min(1).max(2) },
    async (a, ctx) => {
      const results: Record<string, unknown> = {};
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
          await ctx.payload.update({ collection: 'posts', id: a.id, locale: l, draft: false, data: data as never, ...as(ctx) });
          results[l] = { published: true };
        } catch (error) {
          results[l] = { published: false, reason: error instanceof Error ? error.message : String(error) };
        }
      }
      return { id: a.id, results, note: 'The site rebuilds after a publish; it can take a few minutes to appear.' };
    },
  ),

  define(
    'unpublish_post',
    'Take a post you created OFF the site entirely (both languages). It stays as a draft you can edit and publish again. Never blocked.',
    { id: z.union([z.number(), z.string()]) },
    async (a, ctx) => {
      // The whole post goes back to draft. A single language cannot be taken down on its own: Payload publishes the
      // whole latest draft on any non-draft save, which could put an unreviewed edit in the other language live.
      await ctx.payload.update({
        collection: 'posts',
        id: a.id,
        locale: 'en',
        draft: false,
        data: { _status: 'draft' } as never,
        ...as(ctx),
      });
      return {
        id: a.id,
        status: 'draft',
        live: false,
        tip: 'To bring back one language only: update_draft with visible:false on the other, then publish_post.',
      };
    },
  ),
];
