import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type Payload } from 'payload';
import { roleOf } from '../access';
import { autoPublishEnabled, dailyLimit, publishProblems, withinDailyLimit, type Locale } from '../lib/agentPolicy';
import { findBlocks, type LexicalRoot } from '../lib/markdown';

/** Written with its own transaction (no `req`), so a refusal is still recorded after the refused save rolls back. */
export async function auditAgent(
  payload: Payload,
  entry: {
    tool: string;
    outcome: 'ok' | 'refused' | 'error';
    userId?: number | string;
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

/**
 * Runs on every save of a post. Humans pass straight through. For an agent key this is the enforcement the MCP tools
 * rely on, so it holds even if the key is used against the plain REST API:
 *   - the post is marked as the agent's own (the only ones it may later change);
 *   - HTML embeds (script) are refused;
 *   - a save that leaves the post live in this language needs the kill switch on, a clean policy report and daily
 *     headroom; taking a language down is always allowed.
 */
export const agentBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (!isAgent(req.user)) return data;
  const payload = req.payload;
  const locale = (req.locale === 'ja' ? 'ja' : 'en') as Locale;
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, any>;
  const refuse = async (message: string): Promise<never> => {
    await auditAgent(payload, {
      tool: 'save',
      outcome: 'refused',
      userId: req.user!.id,
      postId: originalDoc?.id,
      locale,
      summary: message.split('\n')[0],
      detail: message,
    });
    throw new APIError(message, 403, undefined, true);
  };

  if (operation === 'create') data.createdByAgent = true;
  if (operation === 'update' && originalDoc && originalDoc.createdByAgent !== true) {
    await refuse('An agent may only change posts it created itself.');
  }
  // Never let a request flip the ownership flag.
  if (operation === 'update') data.createdByAgent = true;

  const content = merged.content as LexicalRoot | undefined;
  if (findBlocks(content, 'html-embed').length || findBlocks(content, 'gallery-strip').length) {
    await refuse('Agents cannot add HTML embeds or photo strips. Ask an admin.');
  }

  // Payload promotes the WHOLE latest draft (every language) whenever a post is saved as published, so the rules are
  // judged for every language that will be visible afterwards, not only the one in this request. Otherwise a save in
  // English could put an unreviewed Japanese edit live. Taking a post down (status draft) is never blocked.
  if (merged._status === 'published') {
    if (!autoPublishEnabled()) {
      await refuse(
        'Auto-publishing is switched off (AGENT_AUTO_PUBLISH is not 1). The draft is saved; a person publishes it in the admin.',
      );
    }
    const everyLocale = originalDoc?.id
      ? ((await req.payload.findByID({
          collection: 'posts',
          id: originalDoc.id,
          draft: true,
          locale: 'all',
          fallbackLocale: false,
          depth: 1,
          overrideAccess: true,
        })) as Record<string, any>)
      : {};
    const byLocale = (field: string, l: Locale) => (l === locale ? merged[field] : everyLocale[field]?.[l]);
    const category = typeof merged.category === 'object' ? merged.category?.id : merged.category;
    const hero = merged.hero && typeof merged.hero === 'object' ? merged.hero : undefined;
    const visible = (['en', 'ja'] as Locale[]).filter((l) => byLocale('publishedIn', l) === true);
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
      });
      if (problems.length) {
        await refuse(
          `Not published: the ${l} version would go live and breaks the rules:\n- ${problems.join('\n- ')}\n` +
            `Fix it, or hide that language first (update_draft with visible: false).`,
        );
      }
    }

    if (visible.length) {
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
  }
  return data;
};

/** After a successful agent publish: record it (this is what the daily limit counts). */
export const agentAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  // Only a save that leaves content visible in this language counts; taking a language down is not a publish.
  if (!isAgent(req.user) || doc._status !== 'published' || doc.publishedIn !== true) return doc;
  const locale = req.locale === 'ja' ? 'ja' : 'en';
  await auditAgent(req.payload, {
    tool: 'publish',
    outcome: 'ok',
    userId: req.user!.id,
    postId: doc.id,
    locale,
    summary: `${doc.slug} (${locale})${previousDoc?._status === 'published' ? ' updated' : ' published'}`,
  });
  return doc;
};
