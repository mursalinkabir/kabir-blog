import type { CollectionAfterChangeHook, GlobalAfterChangeHook } from 'payload';

/**
 * Tells GitHub Actions to rebuild and publish the site when content goes live (docs/PLAN.md, Phase 7).
 * `repository_dispatch` with event type `content-published` is what .github/workflows/content.yml listens for.
 *
 *   GITHUB_DISPATCH_TOKEN   fine-grained token, repository kabir-blog only, permission "Contents: Read and write"
 *   GITHUB_REPOSITORY       default mursalinkabir/kabir-blog
 *
 * With no token (local development) it logs and does nothing. Bursts (an agent publishing two languages, an editor
 * saving three pages) become ONE dispatch: the call is delayed and restarted by each new publish.
 */
const DEBOUNCE_MS = 20_000;
let timer: ReturnType<typeof setTimeout> | undefined;

export async function sendDispatch(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'skipped'> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token) return 'skipped';
  const repo = env.GITHUB_REPOSITORY ?? 'mursalinkabir/kabir-blog';
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'content-published' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 204) throw new Error(`GitHub dispatch answered ${res.status}`);
  return 'sent';
}

export function scheduleDispatch(log: { info: (m: string) => void; error: (o: unknown, m: string) => void }, delay = DEBOUNCE_MS) {
  if (!process.env.GITHUB_DISPATCH_TOKEN) {
    log.info('content published; GITHUB_DISPATCH_TOKEN is not set, so no site rebuild was requested');
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    sendDispatch()
      .then(() => log.info('content-published dispatched to GitHub Actions'))
      .catch((err) => log.error(err, 'content-published dispatch failed'));
  }, delay);
  timer.unref?.();
}

export const dispatchAfterPublish: CollectionAfterChangeHook = ({ doc, req }) => {
  if (doc?._status === 'published') scheduleDispatch(req.payload.logger);
  return doc;
};

export const dispatchAfterGlobalChange: GlobalAfterChangeHook = ({ doc, req }) => {
  scheduleDispatch(req.payload.logger);
  return doc;
};
