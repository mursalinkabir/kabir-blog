/**
 * The rules an AI agent's post must meet before it can go live. Pure functions, so they are unit-tested and the same
 * list is used by the `check_post` tool (a dry run) and by the publish gate inside the CMS (the real enforcement).
 */
import { findBlocks, plainText, type LexicalNode, type LexicalRoot } from './markdown';
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
  /**
   * The content as it is stored now (latest draft) in this locale. Embeds and photo strips that are unchanged from it
   * were written by a person and may stay; with no baseline, any of them is a problem (a new document has none).
   */
  baseline?: LexicalRoot | null;
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
  // Script never comes from an agent: embeds are admin-only (the block is also refused on save). One a person already
  // put in this document may stay, byte for byte.
  problems.push(...restrictedBlockProblems(body, input.baseline));

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

// ---- blocks only an admin may add ---------------------------------------------------------------------------------

/** Block types an agent can keep but never create or change: script and free layout. */
export const ADMIN_ONLY_BLOCKS = ['html-embed', 'gallery-strip'] as const;

/** Is every field `a` carries present in `b` with the same value? `b` may hold more (defaults Payload added on save). */
const carriedBy = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => carriedBy(x, b[i]));
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
    return Object.entries(a as Record<string, unknown>).every(
      ([k, v]) => k === 'blockName' || carriedBy(v, (b as Record<string, unknown>)[k]),
    );
  }
  return a === b;
};

/**
 * Embeds and photo strips in `content` that are not already in `baseline` with the same id and the same values. An
 * agent editing a person's post gets them back through `[[keep:id]]` unchanged; anything else is new or altered and is
 * refused.
 */
export function restrictedBlockProblems(content: LexicalRoot | null | undefined, baseline?: LexicalRoot | null): string[] {
  const out: string[] = [];
  for (const type of ADMIN_ONLY_BLOCKS) {
    const stored = new Map(findBlocks(baseline, type).map((n) => [(n.fields as { id?: string }).id, n.fields]));
    const fresh = findBlocks(content, type).filter((n) => {
      const f = n.fields as { id?: string };
      return !f.id || !stored.has(f.id) || !carriedBy(f, stored.get(f.id));
    });
    if (fresh.length) {
      out.push(
        type === 'html-embed'
          ? 'HTML embeds can only be added by an admin.'
          : 'Photo strips can only be added by an admin (an existing one may stay exactly as it is).',
      );
    }
  }
  return out;
}

// ---- pages and projects --------------------------------------------------------------------------------------------

export type DocKind = 'page' | 'project';

export interface DocInput {
  kind: DocKind;
  locale: Locale;
  title?: string | null;
  summary?: string | null;
  slug?: string | null;
  content?: LexicalRoot | null;
  /** Links the document carries (project links, repo): all must be https. */
  urls?: (string | null | undefined)[];
  /** Links the stored document already had: a person's older link is not the agent's problem. */
  knownUrls?: (string | null | undefined)[];
  baseline?: LexicalRoot | null;
}

/** Shorter than a post: an About page or a project note can be brief. Overridable with AGENT_MIN_CHARS_DOC. */
export const docMinChars = (env: Record<string, string | undefined> = process.env): Record<Locale, number> => {
  const n = Number(env.AGENT_MIN_CHARS_DOC);
  return Number.isFinite(n) && n > 0 ? { en: n, ja: n } : { en: 120, ja: 60 };
};

export const MAX_SUMMARY = 200;

/** Reasons this page or project may not go live in this locale. Empty means it may. */
export function docProblems(input: DocInput, policy: PolicyOptions = defaultPolicy()): string[] {
  const problems: string[] = [];
  const l = input.locale;
  const title = (input.title ?? '').trim();
  if (!title) problems.push(`There is no ${l} title.`);
  if (title.length > MAX_TITLE) problems.push(`The title is ${title.length} characters; the limit is ${MAX_TITLE}.`);
  if (!input.slug) problems.push('There is no slug.');
  let summary = '';
  if (input.kind === 'project') {
    summary = (input.summary ?? '').trim();
    if (!summary) problems.push(`There is no ${l} summary.`);
    if (summary.length > MAX_SUMMARY) problems.push(`The summary is ${summary.length} characters; the limit is ${MAX_SUMMARY}.`);
  }
  const text = plainText(input.content);
  const min = docMinChars()[l];
  if (!text) problems.push(`There is no ${l} text.`);
  else if (text.length < min) problems.push(`The ${l} text is ${text.length} characters; at least ${min} are required.`);
  problems.push(...restrictedBlockProblems(input.content, input.baseline));
  for (const url of badUrls(input.urls ?? [], input.knownUrls)) problems.push(`"${url}" is not an https:// link.`);
  for (const hit of scanText([title, summary, text].join('\n'), policy.denylist, { phones: true }) as string[]) {
    problems.push(`Privacy: ${hit}. Remove it before publishing.`);
  }
  return problems;
}

// ---- links and site-wide settings -----------------------------------------------------------------------------------

export const isHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/** A link the site may print: https, or a path inside the site (`/projects/x/`, never `//host`). */
export const isLinkOk = (value: string): boolean => isHttps(value) || /^\/(?!\/)\S*$/.test(value);

/** Links that are not acceptable and are new (not in `known`). */
export const badUrls = (urls: (string | null | undefined)[], known: (string | null | undefined)[] = []): string[] => {
  const had = new Set(known.filter(Boolean));
  return urls.filter((u): u is string => Boolean(u) && !had.has(u as string) && !isLinkOk(u as string));
};

/** Hosts a social button in the footer may point to. These appear on every page, so the list is closed. */
export const socialHosts = (env: Record<string, string | undefined> = process.env): string[] =>
  (env.AGENT_SOCIAL_HOSTS ?? 'github.com,linkedin.com,x.com,twitter.com,mastodon.social,bsky.app,youtube.com,zenn.dev,qiita.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

export const socialHostAllowed = (value: string, hosts: string[] = socialHosts()): boolean => {
  if (!isHttps(value)) return false;
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
};

/** Every string leaf of a value, for comparing what an edit adds with what was already there. */
export function stringLeaves(value: unknown, out: string[] = [], key = ''): string[] {
  if (typeof value === 'string') {
    if (key !== 'id' && key !== 'email') out.push(value);
  } else if (Array.isArray(value)) value.forEach((v) => stringLeaves(v, out, key));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) stringLeaves(v, out, k);
  }
  return out;
}

/** Strings in `next` that `previous` did not already contain: the text an agent is actually adding. */
export function addedStrings(next: unknown, previous: unknown): string[] {
  const had = new Set(stringLeaves(previous));
  return stringLeaves(next).filter((s) => !had.has(s));
}

/** Privacy findings in only the text that is new, so a public contact address already on the page never blocks a save. */
export function privacyProblems(next: unknown, previous: unknown, policy: PolicyOptions = defaultPolicy()): string[] {
  const added = addedStrings(next, previous);
  if (!added.length) return [];
  return (scanText(added.join('\n'), policy.denylist, { phones: true }) as string[]).map(
    (hit) => `Privacy: ${hit}. Remove it before saving.`,
  );
}

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

/** Rules for the four site-wide settings an agent may change (the contact address is admin-only at field level). */
export function globalProblems(slug: string, data: Row, previous?: unknown): string[] {
  const problems: string[] = [];
  const known = new Set(stringLeaves(previous));
  const https = (label: string, url: unknown) => {
    if (typeof url === 'string' && url && !known.has(url) && !isLinkOk(url)) problems.push(`${label} "${url}" is not an https:// link.`);
  };
  if (slug === 'site') {
    for (const s of rows(data.socials)) {
      const url = String(s.url ?? '');
      if (known.has(url)) continue;
      if (!socialHostAllowed(url)) {
        problems.push(`Social link "${url}" must be https:// on one of: ${socialHosts().join(', ')}.`);
      }
    }
  }
  if (slug === 'resume') {
    const basics = (data.basics ?? {}) as Row;
    https('Website', basics.url);
    for (const p of rows(basics.profiles)) https('Profile link', p.url);
    for (const p of rows(data.projects)) https('Project link', p.url);
  }
  return problems;
}

/** The stale-edit check: an agent must say which version it read, and that must still be the stored one. */
export function staleProblem(expected: string | undefined, actual: string | undefined): string | undefined {
  if (!expected) return 'Send expected_updated_at (the updatedAt the get_* tool returned) so a newer edit is not overwritten.';
  if (!actual) return undefined;
  return new Date(expected).getTime() === new Date(actual).getTime()
    ? undefined
    : `This was changed after you read it (now ${actual}, you read ${expected}). Read it again and redo the edit.`;
}
