/** Page and project tools: same draft, check and publish flow as posts, for About-style pages and the project list. */
import { z } from 'zod';
import { docProblems, autoPublishEnabled } from '../lib/agentPolicy';
import { markdownToLexical, preservedBlocks, type LexicalRoot } from '../lib/markdown';
import {
  adminUrl,
  as,
  asWrite,
  assertFresh,
  define,
  docId,
  expectedUpdatedAt,
  language,
  loadDoc,
  LOCALES,
  markdownOf,
  slugShape,
} from './shared';

type Kind = 'pages' | 'projects';
const PROJECT_STATES = ['active', 'maintained', 'archived', 'idea'] as const;

const title = z.string().min(2).max(120);
const markdown = z.string().min(1).max(100_000);
const link = z.object({ label: z.string().min(1).max(60), url: z.string().url() });

async function listDocs(ctx: Parameters<Parameters<typeof define>[3]>[1], collection: Kind, status: string | undefined, limit: number) {
  const res = await ctx.payload.find({
    collection,
    limit,
    sort: '-updatedAt',
    depth: 0,
    draft: true,
    locale: 'all',
    where: status ? { _status: { equals: status } } : undefined,
    ...as(ctx),
  });
  return res.docs.map((p: any) => ({
    id: p.id,
    slug: p.slug,
    status: p._status,
    title: { en: p.title?.en ?? null, ja: p.title?.ja ?? null },
    updatedAt: p.updatedAt,
  }));
}

/** Both languages as Markdown; blocks Markdown cannot express appear as [[keep:id]]. */
async function readDoc(ctx: Parameters<Parameters<typeof define>[3]>[1], collection: Kind, id: number | string) {
  const out: Record<string, unknown> = {};
  let base: Record<string, any> | undefined;
  for (const l of LOCALES) {
    const p = await loadDoc(ctx, collection, id, l);
    base ??= p;
    out[l] = {
      language: l,
      title: p.title ?? null,
      ...(collection === 'projects' ? { summary: p.summary ?? null } : {}),
      markdown: markdownOf(p.content),
    };
  }
  const b = base!;
  return {
    id,
    slug: b.slug,
    status: b._status,
    updatedAt: b.updatedAt,
    ...(collection === 'projects'
      ? {
          projectStatus: b.status,
          stack: (b.stack ?? []).map((s: any) => s.label),
          repo: b.repo ?? null,
          links: (b.links ?? []).map((x: any) => ({ label: x.label, url: x.url })),
          featured: b.featured,
          order: b.order,
          hero: b.hero ? { id: b.hero.id ?? b.hero, alt: b.hero.alt ?? null } : null,
        }
      : {}),
    ...out,
    adminUrl: adminUrl(id, 'en', collection),
    note: '[[keep:ID]] lines are blocks Markdown cannot express; leave them exactly where they are.',
  };
}

export const docTools = [
  // ---- pages ----------------------------------------------------------------------------------------------------
  define(
    'list_pages',
    'List standalone pages (About and similar), newest change first, with id, slug, status and titles.',
    { status: z.enum(['draft', 'published']).optional(), limit: z.number().int().min(1).max(50).default(20) },
    (a, ctx) => listDocs(ctx, 'pages', a.status, a.limit),
    'pages',
  ),
  define(
    'get_page',
    'Read one page in both languages as Markdown, with updatedAt for later edits.',
    { id: docId },
    (a, ctx) => readDoc(ctx, 'pages', a.id),
    'pages',
  ),
  define(
    'save_page',
    'Create a page (send slug, title and markdown) or change one language of an existing page (send id and expected_updated_at). Saved as a DRAFT; nothing goes live.',
    {
      id: docId.optional().describe('Omit to create a new page.'),
      expected_updated_at: expectedUpdatedAt.optional(),
      language,
      slug: slugShape.optional().describe('Required when creating. Permanent once published.'),
      title: title.optional(),
      markdown: markdown.optional(),
    },
    async (a, ctx) => {
      if (a.id === undefined) {
        if (!a.slug || !a.title || !a.markdown) throw new Error('To create a page send slug, title and markdown.');
        const doc = await ctx.payload.create({
          collection: 'pages',
          locale: a.language,
          draft: true,
          data: { slug: a.slug, title: a.title, content: markdownToLexical(a.markdown), _status: 'draft' } as never,
          ...as(ctx),
        });
        return { id: doc.id, status: 'draft', updatedAt: doc.updatedAt, adminUrl: adminUrl(doc.id, a.language, 'pages') };
      }
      const existing = await loadDoc(ctx, 'pages', a.id, a.language);
      assertFresh(a.expected_updated_at, existing.updatedAt);
      const data: Record<string, unknown> = {};
      if (a.title !== undefined) data.title = a.title;
      if (a.slug !== undefined) data.slug = a.slug;
      if (a.markdown !== undefined) data.content = markdownToLexical(a.markdown, { preserved: preservedBlocks(existing.content) });
      if (!Object.keys(data).length) throw new Error('Nothing to change: send title, slug or markdown.');
      const saved = await ctx.payload.update({
        collection: 'pages',
        id: a.id,
        locale: a.language,
        draft: true,
        data: data as never,
        ...asWrite(ctx),
      });
      return { id: a.id, language: a.language, changed: Object.keys(data), status: 'draft saved (not public)', updatedAt: saved.updatedAt };
    },
    'pages',
  ),
  define(
    'check_page',
    'Dry run of the publish rules for one language of a page. Changes nothing.',
    { id: docId, language },
    async (a, ctx) => {
      const p = await loadDoc(ctx, 'pages', a.id, a.language);
      const problems = docProblems({
        kind: 'page',
        locale: a.language,
        title: p.title,
        slug: p.slug,
        content: p.content as LexicalRoot,
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
    'pages',
  ),
  define(
    'publish_page',
    'Publish a page. Every language that has a title or text goes live together, so each must pass the rules; if one fails nothing changes.',
    { id: docId, expected_updated_at: expectedUpdatedAt },
    async (a, ctx) => {
      const first = await loadDoc(ctx, 'pages', a.id, 'en');
      assertFresh(a.expected_updated_at, first.updatedAt);
      const p = first;
      await ctx.payload.update({
        collection: 'pages',
        id: a.id,
        locale: 'en',
        draft: false,
        data: { title: p.title, slug: p.slug, content: p.content, _status: 'published' } as never,
        ...asWrite(ctx),
      });
      return { id: a.id, published: true, note: 'The site rebuilds after a publish; it can take a few minutes to appear.' };
    },
    'pages',
  ),
  define(
    'unpublish_page',
    'Take a page OFF the site (both languages). It stays as a draft. Never blocked.',
    { id: docId },
    async (a, ctx) => {
      await ctx.payload.update({
        collection: 'pages',
        id: a.id,
        locale: 'en',
        draft: false,
        data: { _status: 'draft' } as never,
        ...asWrite(ctx),
      });
      return { id: a.id, status: 'draft', live: false };
    },
    'pages',
  ),

  // ---- projects -------------------------------------------------------------------------------------------------
  define(
    'list_projects',
    'List projects, newest change first, with id, slug, status and titles.',
    { status: z.enum(['draft', 'published']).optional(), limit: z.number().int().min(1).max(50).default(20) },
    (a, ctx) => listDocs(ctx, 'projects', a.status, a.limit),
    'projects',
  ),
  define(
    'get_project',
    'Read one project in both languages as Markdown, with its links, stack and updatedAt.',
    { id: docId },
    (a, ctx) => readDoc(ctx, 'projects', a.id),
    'projects',
  ),
  define(
    'save_project',
    'Create a project (send slug, title, summary and markdown) or change one language of an existing one (send id and expected_updated_at). Saved as a DRAFT; nothing goes live. Fields without a language (stack, links, repo, state, featured, order, hero) apply to every language; a list you send replaces the old list.',
    {
      id: docId.optional().describe('Omit to create a new project.'),
      expected_updated_at: expectedUpdatedAt.optional(),
      language,
      slug: slugShape.optional().describe('Required when creating. Permanent once published.'),
      title: title.optional(),
      summary: z.string().min(5).max(200).optional(),
      markdown: markdown.optional(),
      state: z.enum(PROJECT_STATES).optional(),
      stack: z.array(z.string().min(1).max(40)).max(20).optional(),
      repo: z.string().url().nullable().optional().describe('https:// link to public source; null clears it.'),
      links: z.array(link).max(10).optional(),
      featured: z.boolean().optional(),
      order: z.number().int().optional().describe('Lower numbers first.'),
      hero: z.union([docId, z.null()]).optional().describe('Media id from upload_image or list_media; null removes it.'),
    },
    async (a, ctx) => {
      const rest: Record<string, unknown> = {};
      if (a.state !== undefined) rest.status = a.state;
      if (a.stack !== undefined) rest.stack = a.stack.map((label) => ({ label }));
      if (a.repo !== undefined) rest.repo = a.repo;
      if (a.links !== undefined) rest.links = a.links;
      if (a.featured !== undefined) rest.featured = a.featured;
      if (a.order !== undefined) rest.order = a.order;
      if (a.hero !== undefined) rest.hero = a.hero;
      if (a.id === undefined) {
        if (!a.slug || !a.title || !a.summary || !a.markdown)
          throw new Error('To create a project send slug, title, summary and markdown.');
        const doc = await ctx.payload.create({
          collection: 'projects',
          locale: a.language,
          draft: true,
          data: {
            slug: a.slug,
            title: a.title,
            summary: a.summary,
            content: markdownToLexical(a.markdown),
            ...rest,
            _status: 'draft',
          } as never,
          ...as(ctx),
        });
        return { id: doc.id, status: 'draft', updatedAt: doc.updatedAt, adminUrl: adminUrl(doc.id, a.language, 'projects') };
      }
      const existing = await loadDoc(ctx, 'projects', a.id, a.language);
      assertFresh(a.expected_updated_at, existing.updatedAt);
      const data: Record<string, unknown> = { ...rest };
      if (a.title !== undefined) data.title = a.title;
      if (a.summary !== undefined) data.summary = a.summary;
      if (a.slug !== undefined) data.slug = a.slug;
      if (a.markdown !== undefined) data.content = markdownToLexical(a.markdown, { preserved: preservedBlocks(existing.content) });
      if (!Object.keys(data).length)
        throw new Error('Nothing to change: send at least one field besides id, language and expected_updated_at.');
      const saved = await ctx.payload.update({
        collection: 'projects',
        id: a.id,
        locale: a.language,
        draft: true,
        data: data as never,
        ...asWrite(ctx),
      });
      return { id: a.id, language: a.language, changed: Object.keys(data), status: 'draft saved (not public)', updatedAt: saved.updatedAt };
    },
    'projects',
  ),
  define(
    'check_project',
    'Dry run of the publish rules for one language of a project. Changes nothing.',
    { id: docId, language },
    async (a, ctx) => {
      const p = await loadDoc(ctx, 'projects', a.id, a.language);
      const problems = docProblems({
        kind: 'project',
        locale: a.language,
        title: p.title,
        summary: p.summary,
        slug: p.slug,
        content: p.content as LexicalRoot,
        urls: [p.repo, ...(p.links ?? []).map((l: any) => l.url)],
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
    'projects',
  ),
  define(
    'publish_project',
    'Publish a project. Every language that has a title or text goes live together, so each must pass the rules; if one fails nothing changes.',
    { id: docId, expected_updated_at: expectedUpdatedAt },
    async (a, ctx) => {
      const p = await loadDoc(ctx, 'projects', a.id, 'en');
      assertFresh(a.expected_updated_at, p.updatedAt);
      await ctx.payload.update({
        collection: 'projects',
        id: a.id,
        locale: 'en',
        draft: false,
        data: {
          title: p.title,
          summary: p.summary,
          slug: p.slug,
          status: p.status,
          stack: p.stack,
          repo: p.repo,
          links: p.links,
          featured: p.featured,
          order: p.order,
          hero: p.hero?.id ?? p.hero ?? undefined,
          content: p.content,
          _status: 'published',
        } as never,
        ...asWrite(ctx),
      });
      return { id: a.id, published: true, note: 'The site rebuilds after a publish; it can take a few minutes to appear.' };
    },
    'projects',
  ),
  define(
    'unpublish_project',
    'Take a project OFF the site (both languages). It stays as a draft. Never blocked.',
    { id: docId },
    async (a, ctx) => {
      await ctx.payload.update({
        collection: 'projects',
        id: a.id,
        locale: 'en',
        draft: false,
        data: { _status: 'draft' } as never,
        ...asWrite(ctx),
      });
      return { id: a.id, status: 'draft', live: false };
    },
    'projects',
  ),
];
