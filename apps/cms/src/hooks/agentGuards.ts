import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type GlobalAfterChangeHook,
  type GlobalBeforeChangeHook,
  type Payload,
  type PayloadRequest,
} from 'payload';
import { roleOf } from '../access';
import {
  autoPublishEnabled,
  badUrls,
  dailyLimit,
  docProblems,
  globalProblems,
  privacyProblems,
  publishProblems,
  restrictedBlockProblems,
  withinDailyLimit,
  type DocKind,
  type Locale,
} from '../lib/agentPolicy';
import { plainText, type LexicalRoot } from '../lib/markdown';

/** Written with its own transaction (no `req`), so a refusal is still recorded after the refused save rolls back. */
export async function auditAgent(
  payload: Payload,
  entry: {
    tool: string;
    outcome: 'ok' | 'refused' | 'error';
    userId?: number | string;
    collection?: string;
    postId?: number | string;
    locale?: string;
    summary?: string;
    detail?: string;
  },
) {
  try {
    await payload.create({
      collection: 'agent-log',
      overrideAccess: true,
      data: {
        tool: entry.tool,
        outcome: entry.outcome,
        userId: entry.userId === undefined ? undefined : Number(entry.userId),
        collection: entry.collection,
        postId: entry.postId === undefined ? undefined : Number(entry.postId),
        locale: entry.locale,
        summary: entry.summary?.slice(0, 200),
        detail: entry.detail?.slice(0, 4000),
      } as never,
    });
  } catch (error) {
    payload.logger.error({ err: error }, 'agent-log write failed');
  }
}

const isAgent = (user: unknown) => roleOf(user) === 'agent';
const LOCALES: Locale[] = ['en', 'ja'];
const localeOf = (req: PayloadRequest): Locale => (req.locale === 'ja' ? 'ja' : 'en');

/** Records the refusal, then stops the save with a message the agent can act on. */
function refuser(req: PayloadRequest, collection: string, id?: number | string) {
  return async (message: string): Promise<never> => {
    await auditAgent(req.payload, {
      tool: 'save',
      outcome: 'refused',
      userId: req.user!.id,
      collection,
      postId: id,
      locale: localeOf(req),
      summary: message.split('\n')[0],
      detail: message,
    });
    throw new APIError(message, 403, undefined, true);
  };
}

/** Kill switch first, then the rolling daily allowance. Both are CMS-wide, shared by every kind of content. */
async function assertMayGoLive(payload: Payload, refuse: (m: string) => Promise<never>, what: string) {
  if (!autoPublishEnabled()) {
    await refuse(`Auto-publishing is switched off (AGENT_AUTO_PUBLISH is not 1). ${what}`);
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await payload.count({
    collection: 'agent-log',
    overrideAccess: true,
    where: { and: [{ tool: { equals: 'publish' } }, { outcome: { equals: 'ok' } }, { createdAt: { greater_than: since } }] },
  });
  if (!withinDailyLimit(recent.totalDocs, dailyLimit())) {
    await refuse(`Daily publish limit reached (${dailyLimit()} per 24 hours). Try again later or ask an admin.`);
  }
}

/** The latest stored version (drafts included) in every language: the baseline an edit is judged against. */
async function latestOf(req: PayloadRequest, collection: 'posts' | 'pages' | 'projects', id: unknown): Promise<Record<string, any>> {
  if (!id) return {};
  return (await req.payload.findByID({
    collection,
    id: id as number | string,
    draft: true,
    locale: 'all',
    fallbackLocale: false,
    depth: 1,
    overrideAccess: true,
  })) as Record<string, any>;
}

/**
 * Runs on every save of a post. Humans pass straight through. For an agent key this is the enforcement the MCP tools
 * rely on, so it holds even if the key is used against the plain REST API:
 *   - a post the agent creates is marked (provenance only; an agent may change any post);
 *   - HTML embeds and photo strips cannot be added or altered, only kept exactly as they are;
 *   - a save that leaves the post live in this language needs the kill switch on, a clean policy report and daily
 *     headroom; taking a language down is always allowed.
 */
export const agentBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (!isAgent(req.user)) return data;
  const payload = req.payload;
  const locale = localeOf(req);
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, any>;
  const refuse = refuser(req, 'posts', originalDoc?.id);

  if (operation === 'create') data.createdByAgent = true;
  else delete data.createdByAgent; // the flag records who created a post; a request never flips it

  const latest = await latestOf(req, 'posts', originalDoc?.id);

  if (data.content) {
    const blocked = restrictedBlockProblems(data.content as LexicalRoot, latest.content?.[locale]);
    if (blocked.length) await refuse(`${blocked.join('\n')} Ask an admin, or leave the existing block as [[keep:id]].`);
  }

  // Payload promotes the WHOLE latest draft (every language) whenever a post is saved as published, so the rules are
  // judged for every language that will be visible afterwards, not only the one in this request. Otherwise a save in
  // English could put an unreviewed Japanese edit live. Taking a post down (status draft) is never blocked.
  if (merged._status === 'published') {
    const byLocale = (field: string, l: Locale) => (l === locale ? merged[field] : latest[field]?.[l]);
    const category = typeof merged.category === 'object' ? merged.category?.id : merged.category;
    const hero = merged.hero && typeof merged.hero === 'object' ? merged.hero : undefined;
    const visible = LOCALES.filter((l) => byLocale('publishedIn', l) === true);
    if (visible.length && !autoPublishEnabled()) {
      await refuse(
        'Auto-publishing is switched off (AGENT_AUTO_PUBLISH is not 1). The draft is saved; a person publishes it in the admin.',
      );
    }
    for (const l of visible) {
      const problems = publishProblems({
        locale: l,
        title: byLocale('title', l),
        description: byLocale('description', l),
        slug: merged.slug,
        content: byLocale('content', l) as LexicalRoot | undefined,
        publishedIn: true,
        hasCategory: Boolean(category),
        coverHasAlt: hero ? Boolean(hero.alt && String(hero.alt).trim()) : undefined,
        baseline: latest.content?.[l] as LexicalRoot | undefined,
      });
      if (problems.length) {
        await refuse(
          `Not published: the ${l} version would go live and breaks the rules:\n- ${problems.join('\n- ')}\n` +
            `Fix it, or hide that language first (update_draft with visible: false).`,
        );
      }
    }
    if (visible.length) await assertMayGoLive(payload, refuse, 'The draft is saved; a person publishes it in the admin.');
  }
  return data;
};

/** After a successful agent publish: record it (this is what the daily limit counts). */
export const agentAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req, collection }) => {
  // Only a save that leaves content visible in this language counts; taking a language down is not a publish.
  if (!isAgent(req.user) || doc._status !== 'published') return doc;
  if (collection.slug === 'posts' && doc.publishedIn !== true) return doc;
  const locale = localeOf(req);
  await auditAgent(req.payload, {
    tool: 'publish',
    outcome: 'ok',
    userId: req.user!.id,
    collection: collection.slug,
    postId: doc.id,
    locale,
    summary: `${collection.slug}/${doc.slug} (${locale})${previousDoc?._status === 'published' ? ' updated' : ' published'}`,
  });
  return doc;
};

/**
 * Pages and projects. They have no per-language switch: a language is live when it has a title and text, and a
 * publish promotes every language's latest draft, so every language that has content is judged.
 */
export const agentDocBeforeChange =
  (kind: DocKind): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req, collection }) => {
    if (!isAgent(req.user)) return data;
    const locale = localeOf(req);
    const merged = { ...(originalDoc ?? {}), ...data } as Record<string, any>;
    const refuse = refuser(req, collection.slug, originalDoc?.id);
    const latest = await latestOf(req, collection.slug as 'pages' | 'projects', originalDoc?.id);

    if (data.content) {
      const blocked = restrictedBlockProblems(data.content as LexicalRoot, latest.content?.[locale]);
      if (blocked.length) await refuse(`${blocked.join('\n')} Ask an admin, or leave the existing block as [[keep:id]].`);
    }
    const linksOf = (d: Record<string, any>) =>
      kind === 'project' ? [d.repo, ...((d.links ?? []) as { url?: string }[]).map((l) => l.url)] : [];
    const urls = linksOf(merged);
    const knownUrls = linksOf(latest);
    const badUrl = badUrls(urls, knownUrls)[0];
    if (badUrl) await refuse(`"${badUrl}" is not an https:// link.`);

    if (merged._status === 'published') {
      const byLocale = (field: string, l: Locale) => (l === locale ? merged[field] : latest[field]?.[l]);
      const live = LOCALES.filter((l) => byLocale('title', l) || plainText(byLocale('content', l) as LexicalRoot | undefined));
      if (!autoPublishEnabled()) {
        await refuse(
          'Auto-publishing is switched off (AGENT_AUTO_PUBLISH is not 1). The draft is saved; a person publishes it in the admin.',
        );
      }
      for (const l of live) {
        const problems = docProblems({
          kind,
          locale: l,
          title: byLocale('title', l),
          summary: byLocale('summary', l),
          slug: merged.slug,
          content: byLocale('content', l) as LexicalRoot | undefined,
          urls,
          knownUrls,
          baseline: latest.content?.[l] as LexicalRoot | undefined,
        });
        if (problems.length) {
          await refuse(`Not published: the ${l} version would go live and breaks the rules:\n- ${problems.join('\n- ')}`);
        }
      }
      await assertMayGoLive(req.payload, refuse, 'The draft is saved; a person publishes it in the admin.');
    }
    return data;
  };

/**
 * The site-wide settings have no draft stage: a save is a publish. So the kill switch, the daily allowance, the
 * privacy scan (of the text being added only) and the link rules apply to every save an agent makes.
 */
export const agentGlobalBeforeChange =
  (slug: string): GlobalBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    if (!isAgent(req.user)) return data;
    const refuse = refuser(req, `global:${slug}`);
    const merged = { ...(originalDoc ?? {}), ...data } as Record<string, any>;
    const problems = [...globalProblems(slug, merged, originalDoc), ...privacyProblems(data, originalDoc)];
    if (problems.length) await refuse(`Not saved:\n- ${problems.join('\n- ')}`);
    await assertMayGoLive(req.payload, refuse, `The "${slug}" settings go live as soon as they are saved, so nothing was changed.`);
    return data;
  };

export const agentGlobalAfterChange =
  (slug: string): GlobalAfterChangeHook =>
  async ({ doc, req }) => {
    if (!isAgent(req.user)) return doc;
    await auditAgent(req.payload, {
      tool: 'publish',
      outcome: 'ok',
      userId: req.user!.id,
      collection: `global:${slug}`,
      locale: localeOf(req),
      summary: `global ${slug} updated (${localeOf(req)})`,
    });
    return doc;
  };

/**
 * Tags, category names and image details: an agent may edit the words (privacy scan on what it adds) but never
 * replace an image file, and never the category slug (field access).
 */
export const agentTextGuard: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation, collection }) => {
  if (!isAgent(req.user)) return data;
  const refuse = refuser(req, collection.slug, originalDoc?.id);
  if (operation === 'update' && req.file) {
    await refuse('An agent cannot replace an image file. Upload a new image with upload_image and use its id.');
  }
  const problems = privacyProblems(data, originalDoc);
  if (problems.length) await refuse(`Not saved:\n- ${problems.join('\n- ')}`);
  return data;
};
