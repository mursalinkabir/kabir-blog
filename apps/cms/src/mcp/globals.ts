/**
 * The site-wide settings: Now, Uses, Resume and Site. They have no draft stage, so a save is live; the save hook
 * (hooks/agentGuards.ts) applies the kill switch, daily limit, privacy scan and link rules, and Payload keeps the
 * last 25 versions so a bad save can be restored in the admin. The contact email is admin-only.
 */
import { z } from 'zod';
import { markdownToLexical, preservedBlocks } from '../lib/markdown';
import { NAV_KEYS } from '../globals';
import { as, asWrite, assertSameVersion, define, expectedVersion, globalVersion, language, LOCALES, markdownOf } from './shared';

const SLUGS = ['site', 'now', 'uses', 'resume'] as const;
const text = (max: number) => z.string().min(1).max(max);
const nav = z.array(z.enum(NAV_KEYS as [string, ...string[]])).max(20);

const usesItem = z.object({ id: z.string().optional(), name: text(120), note: z.string().max(300).optional() });
const usesGroup = z.object({ id: z.string().optional(), title: text(120), items: z.array(usesItem).max(60) });

const profile = z.object({ network: text(60), url: z.string().url() });
const resumeShape = {
  basics: z
    .object({
      name: text(80).optional(),
      label: text(120).optional(),
      url: z.string().url().optional(),
      summary: z.string().max(2000).optional(),
      profiles: z.array(profile).max(12).optional(),
    })
    .optional()
    .describe('Merged into the current basics. The email is admin-only and cannot be sent.'),
  work: z
    .array(
      z.object({
        name: text(120),
        position: text(120),
        startDate: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM'),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}$/, 'YYYY-MM')
          .optional(),
        highlights: z.array(text(400)).max(12).default([]).describe('Plain strings.'),
      }),
    )
    .optional(),
  education: z
    .array(
      z.object({
        institution: text(120),
        area: text(120),
        studyType: text(80),
        startDate: text(10),
        endDate: z.string().max(10).optional(),
      }),
    )
    .optional(),
  skills: z.array(z.object({ name: text(80), keywords: z.array(text(60)).max(30).default([]).describe('Plain strings.') })).optional(),
  projects: z.array(z.object({ name: text(120), description: text(400), url: z.string().url().optional() })).optional(),
  languages: z.array(z.object({ language: text(60), spoken: text(60), reading: text(60) })).optional(),
  certificates: z.array(z.object({ name: text(120), issuer: text(120), date: text(20) })).optional(),
};

/** A row without its storage id: resume sections are replaced whole, so ids are not needed. */
const strip = (row: Record<string, any>) => {
  const { id: _id, ...rest } = row;
  return rest;
};

/** Ids of the array rows at a path, so an edit that leaves a row out can be caught before it deletes the row. */
const rowIds = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((r) => String((r as { id?: unknown }).id)) : []);

export const globalTools = [
  define(
    'get_global',
    'Read a site-wide setting: site (name, tagline, socials, menus), now (Markdown), uses (groups of items), resume. Returns a version for the update_* tools. Rows carry ids: keep them when you send a list back.',
    { slug: z.enum(SLUGS) },
    async (a, ctx) => {
      const out: Record<string, unknown> = {};
      let base: Record<string, any> | undefined;
      for (const l of LOCALES) {
        const g = (await ctx.payload.findGlobal({ slug: a.slug, locale: l, depth: 0, fallbackLocale: false, ...as(ctx) })) as Record<
          string,
          any
        >;
        base ??= g;
        if (a.slug === 'now') out[l] = { markdown: markdownOf(g.content) };
        else if (a.slug === 'site') out[l] = { name: g.name ?? null, tagline: g.tagline ?? null };
        else if (a.slug === 'uses') out[l] = { groups: g.groups ?? [] };
      }
      const g = base!;
      const shared =
        a.slug === 'site'
          ? { socials: g.socials, nav: g.nav, navMore: g.navMore, email: g.email }
          : a.slug === 'resume'
            ? {
                basics: g.basics,
                work: (g.work ?? []).map((w: any) => ({ ...strip(w), highlights: (w.highlights ?? []).map((h: any) => h.text) })),
                education: (g.education ?? []).map(strip),
                skills: (g.skills ?? []).map((k: any) => ({ ...strip(k), keywords: (k.keywords ?? []).map((w: any) => w.text) })),
                projects: (g.projects ?? []).map(strip),
                languages: (g.languages ?? []).map(strip),
                certificates: (g.certificates ?? []).map(strip),
              }
            : {};
      return { slug: a.slug, version: await globalVersion(ctx, a.slug), ...shared, ...(Object.keys(out).length ? { languages: out } : {}) };
    },
    'globals',
  ),

  define(
    'update_now',
    'Replace the text of the Now page in one language (Markdown). Live as soon as it is saved. Needs expected_version from get_global.',
    { language, markdown: z.string().min(1).max(50_000), expected_version: expectedVersion },
    async (a, ctx) => {
      const g = (await ctx.payload.findGlobal({ slug: 'now', locale: a.language, depth: 0, fallbackLocale: false, ...as(ctx) })) as Record<
        string,
        any
      >;
      assertSameVersion(a.expected_version, await globalVersion(ctx, 'now'));
      await ctx.payload.updateGlobal({
        slug: 'now',
        locale: a.language,
        data: { content: markdownToLexical(a.markdown, { preserved: preservedBlocks(g.content) }) } as never,
        ...asWrite(ctx),
      });
      return { slug: 'now', language: a.language, live: true, version: await globalVersion(ctx, 'now') };
    },
    'globals',
  ),

  define(
    'update_uses',
    "Replace the Uses groups, naming them in one language. Send the whole list; keep each row's id from get_global (a row without id is new). Rows you leave out are deleted in BOTH languages, so that needs remove_missing. Live as soon as it is saved.",
    {
      language,
      groups: z.array(usesGroup).max(30),
      remove_missing: z.boolean().default(false),
      expected_version: expectedVersion,
    },
    async (a, ctx) => {
      const g = (await ctx.payload.findGlobal({ slug: 'uses', locale: a.language, depth: 0, fallbackLocale: false, ...as(ctx) })) as Record<
        string,
        any
      >;
      assertSameVersion(a.expected_version, await globalVersion(ctx, 'uses'));
      const keptGroups = new Set(rowIds(a.groups));
      const dropped: string[] = [];
      for (const old of (g.groups ?? []) as Record<string, any>[]) {
        if (!keptGroups.has(String(old.id))) dropped.push(`group ${String(old.title ?? old.id)}`);
        else {
          const next = a.groups.find((x) => x.id === old.id);
          const kept = new Set(rowIds(next?.items));
          for (const it of (old.items ?? []) as Record<string, any>[])
            if (!kept.has(String(it.id))) dropped.push(`item ${String(it.name ?? it.id)}`);
        }
      }
      if (dropped.length && !a.remove_missing) {
        throw new Error(
          `This would delete (in both languages): ${dropped.join(', ')}. Add them back with their ids, or send remove_missing: true.`,
        );
      }
      await ctx.payload.updateGlobal({ slug: 'uses', locale: a.language, data: { groups: a.groups } as never, ...asWrite(ctx) });
      return { slug: 'uses', language: a.language, live: true, removed: dropped, version: await globalVersion(ctx, 'uses') };
    },
    'globals',
  ),

  define(
    'update_resume',
    'Change sections of the Resume (English only). Each section you send replaces that whole section; sections you leave out are unchanged. A section with fewer rows than now needs allow_shrink. Live as soon as it is saved.',
    { ...resumeShape, allow_shrink: z.boolean().default(false), expected_version: expectedVersion },
    async (a, ctx) => {
      const g = (await ctx.payload.findGlobal({ slug: 'resume', locale: 'en', depth: 0, ...as(ctx) })) as Record<string, any>;
      assertSameVersion(a.expected_version, await globalVersion(ctx, 'resume'));
      const data: Record<string, unknown> = {};
      const shrunk: string[] = [];
      for (const key of ['work', 'education', 'skills', 'projects', 'languages', 'certificates'] as const) {
        const next = a[key];
        if (next === undefined) continue;
        if (next.length < (g[key]?.length ?? 0)) shrunk.push(`${key} (${g[key].length} to ${next.length})`);
        data[key] = next;
      }
      if (a.work) data.work = a.work.map((w) => ({ ...w, highlights: w.highlights.map((text) => ({ text })) }));
      if (a.skills) data.skills = a.skills.map((k) => ({ ...k, keywords: k.keywords.map((text) => ({ text })) }));
      if (shrunk.length && !a.allow_shrink)
        throw new Error(`This would remove rows from: ${shrunk.join(', ')}. Send them all, or allow_shrink: true.`);
      if (a.basics) {
        const { profiles, ...flat } = a.basics;
        data.basics = { ...g.basics, ...flat, ...(profiles ? { profiles } : {}) };
        delete (data.basics as Record<string, unknown>).email; // admin-only field
      }
      if (!Object.keys(data).length) throw new Error('Nothing to change: send at least one section.');
      await ctx.payload.updateGlobal({ slug: 'resume', data: data as never, ...asWrite(ctx) });
      return { slug: 'resume', live: true, changed: Object.keys(data), version: await globalVersion(ctx, 'resume') };
    },
    'globals',
  ),

  define(
    'update_site',
    'Change the site name and tagline (one language), the social buttons and the menus. socials must be https:// links on an allowed host. The contact email cannot be changed here. Live as soon as it is saved.',
    {
      language: language.optional().describe('Required with name or tagline.'),
      name: text(80).optional(),
      tagline: text(200).optional(),
      socials: z
        .array(z.object({ label: text(40), url: z.string().url() }))
        .max(10)
        .optional(),
      nav: nav.optional(),
      navMore: nav.optional(),
      allow_shrink: z.boolean().default(false),
      expected_version: expectedVersion,
    },
    async (a, ctx) => {
      const locale = a.language ?? 'en';
      if ((a.name !== undefined || a.tagline !== undefined) && !a.language) throw new Error('Send language with name or tagline.');
      const g = (await ctx.payload.findGlobal({ slug: 'site', locale, depth: 0, ...as(ctx) })) as Record<string, any>;
      assertSameVersion(a.expected_version, await globalVersion(ctx, 'site'));
      const data: Record<string, unknown> = {};
      if (a.name !== undefined) data.name = a.name;
      if (a.tagline !== undefined) data.tagline = a.tagline;
      if (a.socials !== undefined) {
        if (a.socials.length < (g.socials?.length ?? 0) && !a.allow_shrink)
          throw new Error('This would remove social buttons. Send them all, or allow_shrink: true.');
        data.socials = a.socials;
      }
      if (a.nav !== undefined) data.nav = a.nav;
      if (a.navMore !== undefined) data.navMore = a.navMore;
      if (!Object.keys(data).length) throw new Error('Nothing to change.');
      await ctx.payload.updateGlobal({ slug: 'site', locale, data: data as never, ...asWrite(ctx) });
      return { slug: 'site', live: true, changed: Object.keys(data), version: await globalVersion(ctx, 'site') };
    },
    'globals',
  ),
];
