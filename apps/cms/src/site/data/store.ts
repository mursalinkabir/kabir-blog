// One snapshot of the whole site (a dozen posts) held in memory and thrown away by a hook on every change.
// Valid because the app runs as one replica. Behaviours the tests pin:
//   - concurrent get() calls load once;
//   - invalidate() makes the next get() reload, and schedules a second invalidation after `settleMs`, because Payload's
//     afterChange hooks run before the transaction commits and a reload that fast can still read the old rows;
//   - a failed reload keeps the last good snapshot (stale); a failed first load rejects (the handler answers 503);
//   - the version is a hash of the raw content, so unchanged content keeps its ETags;
//   - after `ttlMs` a reload happens in the background (stale-while-revalidate), a safety net for a missed hook.
import { createHash } from 'node:crypto';
import { createSite, type Site } from './site';
import { mapAll } from './map';
import type { RawContent } from './load';

export interface SnapshotStore {
  get(): Promise<Site>;
  invalidate(): void;
  status(): { version: string | null; loadedAt: string | null; stale: boolean; errors: number };
}

export interface StoreOptions {
  load: () => Promise<RawContent>;
  now?: () => number;
  log?: (message: string) => void;
  ttlMs?: number;
  settleMs?: number;
  preview?: boolean;
}

export function createSnapshotStore(opts: StoreOptions): SnapshotStore {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.warn(`[site] ${m}`));
  const ttlMs = opts.ttlMs ?? 60_000;
  const settleMs = opts.settleMs ?? 2_000;

  let site: Site | null = null;
  let loadedAtMs = 0;
  let errors = 0;
  let stale = false;
  let dirty = true;
  let inflight: Promise<Site> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastLoggedVersion = '';

  async function reload(): Promise<Site> {
    dirty = false;
    try {
      const raw = await opts.load();
      const version = createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 16);
      if (site && site.version === version) {
        loadedAtMs = now();
        stale = false;
        return site;
      }
      const { data, errors: problems } = mapAll(raw);
      if (problems.length && version !== lastLoggedVersion) for (const p of problems) log(`skipped: ${p}`);
      lastLoggedVersion = version;
      errors = problems.length;
      site = createSite(data, { source: 'cms', version, preview: opts.preview });
      loadedAtMs = now();
      stale = false;
      return site;
    } catch (e) {
      dirty = true; // try again on the next request
      if (!site) throw e;
      stale = true;
      log(`reload failed, serving the last good snapshot: ${(e as Error).message}`);
      return site;
    }
  }

  const start = (): Promise<Site> => {
    inflight ??= reload().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  return {
    async get() {
      if (!site) return start();
      if (dirty) return start();
      if (now() - loadedAtMs > ttlMs) void start(); // background refresh; this caller gets the current snapshot
      return site;
    },
    invalidate() {
      dirty = true;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        dirty = true;
      }, settleMs);
      settleTimer.unref?.();
    },
    status: () => ({ version: site?.version ?? null, loadedAt: site ? new Date(loadedAtMs).toISOString() : null, stale, errors }),
  };
}

const KEY = Symbol.for('kabir-blog.siteStore');

/** The process-wide store, kept on globalThis so a dev hot reload does not create a second one. */
export function siteStore(): SnapshotStore {
  const g = globalThis as unknown as Record<symbol, SnapshotStore | undefined>;
  if (!g[KEY]) {
    g[KEY] = createSnapshotStore({
      load: async () => {
        const [{ getPayload }, { default: config }, { loadRaw }] = await Promise.all([
          import('payload'),
          import('@payload-config'),
          import('./load'),
        ]);
        return loadRaw(await getPayload({ config }), { draft: false });
      },
    });
  }
  return g[KEY]!;
}
