/**
 * The rules an AI agent's post must meet before it can go live. Pure functions, so they are unit-tested and the same
 * list is used by the `check_post` tool (a dry run) and by the publish gate inside the CMS (the real enforcement).
 */
import { findBlocks, plainText, type LexicalRoot } from './markdown';
// Same detector as the repository scan and the build gate, so "clean" means one thing everywhere.
import { scanText } from '../../../../scripts/privacy-core.mjs';

export type Locale = 'en' | 'ja';

export interface PublishInput {
  locale: Locale;
  title?: string | null;
  description?: string | null;
  slug?: string | null;
  content?: LexicalRoot | null;
  publishedIn?: boolean | null;
  hasCategory: boolean;
  /** `undefined` = the post has no cover; otherwise whether the cover has alt text in this locale. */
  coverHasAlt?: boolean;
}

export interface PolicyOptions {
  /** Shortest acceptable body, in characters, by locale. Stops one-line "posts". */
  minChars: Record<Locale, number>;
  /** Extra private terms (the same PRIVACY_DENYLIST the CI scan uses). */
  denylist: string[];
}

export const defaultPolicy = (env: Record<string, string | undefined> = process.env): PolicyOptions => {
  const override = Number(env.AGENT_MIN_CHARS);
  return {
    minChars: Number.isFinite(override) && override > 0 ? { en: override, ja: override } : { en: 600, ja: 300 },
    denylist: (env.PRIVACY_DENYLIST ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
};

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 160;

/** Reasons this post may not be published in this locale. Empty means it may. */
export function publishProblems(input: PublishInput, policy: PolicyOptions = defaultPolicy()): string[] {
  const problems: string[] = [];
  const l = input.locale;
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  if (!title) problems.push(`There is no ${l} title.`);
  if (title.length > MAX_TITLE) problems.push(`The title is ${title.length} characters; the limit is ${MAX_TITLE}.`);
  if (!description) problems.push(`There is no ${l} description.`);
  if (description.length > MAX_DESCRIPTION)
    problems.push(`The description is ${description.length} characters; the limit is ${MAX_DESCRIPTION}.`);
  if (!input.slug) problems.push('There is no slug.');
  if (!input.hasCategory) problems.push('There is no category.');
  if (input.publishedIn !== true) problems.push(`"Visible in this language" is off for ${l}.`);
  if (input.coverHasAlt === false) problems.push(`The cover image has no ${l} alt text.`);

  const body = input.content;
  const text = plainText(body);
  if (!text) problems.push(`There is no ${l} text.`);
  else if (text.length < policy.minChars[l]) {
    problems.push(`The ${l} text is ${text.length} characters; at least ${policy.minChars[l]} are required.`);
  }
  // Script never comes from an agent: embeds are admin-only (the block is also refused on save).
  if (findBlocks(body, 'html-embed').length) problems.push('HTML embeds can only be added by an admin.');

  const scan = scanText([title, description, text].join('\n'), policy.denylist, { phones: true }) as string[];
  for (const hit of scan) problems.push(`Privacy: ${hit}. Remove it before publishing.`);
  return problems;
}

/** True while the agent is under its daily publish allowance. */
export const withinDailyLimit = (publishedLast24h: number, max: number): boolean => publishedLast24h < max;

export const dailyLimit = (env: Record<string, string | undefined> = process.env): number => {
  const n = Number(env.AGENT_MAX_PUBLISHES_PER_DAY);
  return Number.isInteger(n) && n > 0 ? n : 6; // events: one post in two languages is two
};

export const autoPublishEnabled = (env: Record<string, string | undefined> = process.env): boolean => env.AGENT_AUTO_PUBLISH === '1';
