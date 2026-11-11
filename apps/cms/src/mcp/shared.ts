/**
 * Shared pieces of the MCP tools an AI agent works with (served at /api/mcp by @payloadcms/plugin-mcp). Every call
 * runs as the user the MCP key belongs to (an `agent` user) with `overrideAccess: false`, so the collection access
 * rules apply; the publish rules live in hooks/agentGuards.ts and apply to any use of that user, not only to these
 * tools.
 */
import { siteStore } from '../site/data/store';
import type { Site } from '../site/data/site';
import { localePath, locales as siteLocales, type Locale as SiteLocale } from '../site/i18n';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Payload, PayloadRequest } from 'payload';
import { roleOf } from '../access';
import { auditAgent } from '../hooks/agentGuards';
import { staleProblem, type Locale } from '../lib/agentPolicy';
import { markdownFromLexical, MarkdownError, type LexicalRoot } from '../lib/markdown';

export const LOCALES = ['en', 'ja'] as const;
export const CATEGORIES = ['tech', 'finance', 'japan-life'] as const;
export const language = z
  .enum(LOCALES)
  .describe('en = English, ja = Japanese. Each language is its own text; nothing is translated for you.');
export const slugShape = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single dashes')
  .max(80);

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const imageHosts = () =>
  (process.env.AGENT_IMAGE_HOSTS ?? 'images.unsplash.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

export type Reply = { content: { type: 'text'; text: string }[] };
export const reply = (value: unknown): Reply => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

export interface Ctx {
  payload: Payload;
  req: PayloadRequest;
  user: NonNullable<PayloadRequest['user']>;
}

/** Local API options that make Payload evaluate access rules for the agent user. */
export const as = (ctx: Ctx) => ({ user: ctx.user, overrideAccess: false as const });

/**
 * Options for a write. `overrideLock: false` makes Payload refuse to overwrite a document a person has open in the
 * admin (its autosave runs every 2 seconds), instead of silently winning.
 */
export const asWrite = (ctx: Ctx) => ({ ...as(ctx), overrideLock: false });

export const docId = z.union([z.number(), z.string()]);
export const expectedUpdatedAt = z
  .string()
  .describe('The updatedAt that the get_* tool returned. The edit is refused if the document changed since you read it.');

/** The stale-edit check: throws a message the agent can act on. */
export function assertFresh(expected: string | undefined, actual: unknown) {
  const problem = staleProblem(expected, actual ? String(actual) : undefined);
  if (problem) throw new Error(problem);
}

/**
 * The version of a site-wide setting: a fingerprint of its content in every language. A timestamp cannot do this job:
 * Payload does not move a global's own updatedAt when only language-specific fields were saved (Now, the Uses text),
 * and the timestamp of its saved version is written a moment after the save returns.
 */
export async function globalVersion(ctx: Ctx, slug: 'site' | 'now' | 'uses' | 'resume'): Promise<string> {
  const docs: unknown[] = [];
  for (const l of LOCALES) {
    docs.push(await ctx.payload.findGlobal({ slug, locale: l, depth: 0, fallbackLocale: false, ...as(ctx) }));
  }
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .filter(([k]) => !['updatedAt', 'createdAt', 'globalType'].includes(k))
              .sort(([x], [y]) => (x < y ? -1 : 1))
              .map(([k, x]) => [k, canon(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canon(docs)))
    .digest('hex')
    .slice(0, 16);
}

export const expectedVersion = z
  .string()
  .describe('The version that get_global returned. The edit is refused if the setting changed since you read it.');

export function assertSameVersion(expected: string | undefined, actual: string) {
  if (!expected) throw new Error('Send expected_version (the version get_global returned) so a newer edit is not overwritten.');
  if (expected !== actual) throw new Error('This was changed after you read it. Read it again with get_global and redo the edit.');
}

export const mediaLink = (id: number | string) => ({ id, use: `![](media:${id} "Caption")` });

/** The audit fields for a call: which collection, which document, which language. */
function target(args: unknown, collection?: string) {
  const a = (args ?? {}) as { id?: unknown; language?: unknown };
  const id = typeof a.id === 'number' || (typeof a.id === 'string' && /^\d+$/.test(a.id)) ? Number(a.id) : undefined;
  return { collection, postId: id, locale: typeof a.language === 'string' ? a.language : undefined };
}

export function define<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<unknown>,
  /** What the tool touches, written to the audit log with the target id and language. */
  collection?: string,
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
        await auditAgent(req.payload, { tool: `mcp:${name}`, outcome: 'ok', userId: user.id, summary: name, ...target(args, collection) });
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
          ...target(raw, collection),
        });
        return reply(`ERROR: ${message}`);
      }
    },
  };
}

export async function categoryId(ctx: Ctx, slug: string): Promise<number | string> {
  const { docs } = await ctx.payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1, depth: 0, ...as(ctx) });
  if (!docs[0]) throw new Error(`Category "${slug}" does not exist.`);
  return docs[0].id;
}

export async function tagIds(ctx: Ctx, tags: { slug: string; name?: string }[], locale: Locale): Promise<(number | string)[]> {
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

export async function loadPost(ctx: Ctx, id: number | string, locale: Locale) {
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

/** Latest stored version (draft included) of a page or project in one language. */
export async function loadDoc(ctx: Ctx, collection: 'pages' | 'projects', id: number | string, locale: Locale) {
  return (await ctx.payload.findByID({
    collection,
    id,
    locale,
    draft: true,
    depth: 1,
    fallbackLocale: false,
    ...as(ctx),
  })) as Record<string, any>;
}

export const markdownOf = (content: unknown) => (content ? markdownFromLexical(content as LexicalRoot) : '');

export const view = (p: Record<string, any>, locale: Locale) => ({
  language: locale,
  title: p.title ?? null,
  description: p.description ?? null,
  visibleInThisLanguage: Boolean(p.publishedIn),
  markdown: p.content ? markdownFromLexical(p.content as LexicalRoot) : '',
});

export const adminUrl = (id: number | string, locale: Locale, collection = 'posts') =>
  `${process.env.CMS_PUBLIC_URL ?? 'http://localhost:3100'}/admin/collections/${collection}/${id}?locale=${locale}`;

export function detectImage(buf: Buffer): { mime: string; ext: string } | undefined {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  if (buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp' && /avif|avis/.test(buf.toString('latin1', 8, 16)))
    return { mime: 'image/avif', ext: 'avif' };
  return undefined;
}

export async function fetchImage(url: string): Promise<Buffer> {
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

// ---------------------------------------------------------------- where a document is live

/** `https://<first public host>`, the address the public site answers on. */
export const liveOrigin = (env: Record<string, string | undefined> = process.env): string =>
  `https://${(env.SITE_PUBLIC_HOSTS ?? 'smkabir.com').split(',')[0]!.trim()}`;

export interface LiveReport {
  /** Language to the public address where the page is live now. */
  live: Partial<Record<SiteLocale, string>>;
  /** Language to the reasons it is not live there. */
  notLive: Partial<Record<SiteLocale, string[]>>;
}

/** Where `slug` is live on `site`, and why it is not in the other languages. Pure. */
export function liveReport(site: Site, kind: 'posts' | 'projects' | 'pages', slug: string, origin: string): LiveReport {
  const out: LiveReport = { live: {}, notLive: {} };
  for (const l of siteLocales) {
    const path = kind === 'posts' ? `/posts/${slug}/` : kind === 'projects' ? `/projects/${slug}/` : `/${slug}/`;
    const exists =
      kind === 'posts'
        ? site.getPosts(l).some((p) => p.slug === slug)
        : kind === 'projects'
          ? site.getProjects(l).some((p) => p.slug === slug)
          : Boolean(site.getPage(slug, l));
    if (exists) out.live[l] = `${origin}${localePath(l, path)}`;
    else
      out.notLive[l] =
        kind === 'posts' ? site.pageBlockersFor(slug, l) : ['not published, or a required field is missing in this language'];
  }
  return out;
}

/** After a write: reloads the public site's snapshot now (the content is committed) and says where the document is live. */
export async function reportLive(kind: 'posts' | 'projects' | 'pages', slug: string): Promise<LiveReport> {
  siteStore().invalidate();
  return liveReport(await siteStore().get(), kind, slug, liveOrigin());
}
