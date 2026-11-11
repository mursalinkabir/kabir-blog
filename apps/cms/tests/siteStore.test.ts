import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSnapshotStore } from '../src/site/data/store';
import type { RawContent } from '../src/site/data/load';

const RAW = JSON.parse(readFileSync(new URL('./fixtures/payload-raw.json', import.meta.url), 'utf8')) as RawContent;
const withTitle = (title: string): RawContent => {
  const r = structuredClone(RAW) as any;
  r.posts.find((p: { slug: string }) => p.slug === 'how-this-site-is-built').title.en = title;
  return r;
};
const quiet = () => undefined;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSnapshotStore', () => {
  it('loads once for concurrent first requests', async () => {
    const load = vi.fn(async () => RAW);
    const store = createSnapshotStore({ load, log: quiet });
    const [a, b] = await Promise.all([store.get(), store.get()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('reloads after invalidate, and once more after the settle delay (a reader between the hook and the commit)', async () => {
    const load = vi.fn<() => Promise<RawContent>>().mockResolvedValue(RAW);
    const store = createSnapshotStore({ load, settleMs: 2000, log: quiet });
    const first = await store.get();
    // The hook fires before the transaction commits: the reload still reads the old rows.
    store.invalidate();
    const during = await store.get();
    expect(during.version).toBe(first.version);
    // The row is committed; the settle timer invalidates again.
    load.mockResolvedValue(withTitle('Changed title'));
    await vi.advanceTimersByTimeAsync(2000);
    const after = await store.get();
    expect(after.version).not.toBe(first.version);
    expect(after.getPosts('en').some((p) => p.title === 'Changed title')).toBe(true);
  });

  it('keeps the same version and the same Site when the content did not change', async () => {
    const store = createSnapshotStore({ load: async () => structuredClone(RAW), log: quiet });
    const a = await store.get();
    store.invalidate();
    const b = await store.get();
    expect(b).toBe(a);
  });

  it('changes the version when one field changes; the version is 16 hex characters', async () => {
    let raw = RAW;
    const store = createSnapshotStore({ load: async () => raw, log: quiet });
    const a = await store.get();
    raw = withTitle('x');
    store.invalidate();
    const b = await store.get();
    expect(a.version).toMatch(/^[0-9a-f]{16}$/);
    expect(b.version).not.toBe(a.version);
  });

  it('serves the last good snapshot when a reload fails', async () => {
    const load = vi.fn<() => Promise<RawContent>>().mockResolvedValueOnce(RAW).mockRejectedValue(new Error('db down'));
    const store = createSnapshotStore({ load, log: quiet });
    const first = await store.get();
    store.invalidate();
    expect(await store.get()).toBe(first);
    expect(store.status().stale).toBe(true);
  });

  it('rejects when the very first load fails, and retries on the next get', async () => {
    const load = vi.fn<() => Promise<RawContent>>().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(RAW);
    const store = createSnapshotStore({ load, log: quiet });
    await expect(store.get()).rejects.toThrow('db down');
    expect((await store.get()).getPosts('en').length).toBeGreaterThan(0);
  });

  it('refreshes in the background after ttlMs without making the caller wait', async () => {
    let raw = RAW;
    const store = createSnapshotStore({ load: async () => raw, ttlMs: 1000, settleMs: 100000, log: quiet });
    const a = await store.get();
    raw = withTitle('later');
    await vi.advanceTimersByTimeAsync(1500);
    expect(await store.get()).toBe(a); // the caller gets the current snapshot at once
    await vi.advanceTimersByTimeAsync(0);
    expect((await store.get()).version).not.toBe(a.version);
  });

  it('a burst of invalidations causes at most two loads', async () => {
    const load = vi.fn(async () => structuredClone(RAW));
    const store = createSnapshotStore({ load, settleMs: 2000, log: quiet });
    await store.get();
    for (let i = 0; i < 50; i++) store.invalidate();
    await store.get();
    await vi.advanceTimersByTimeAsync(2000);
    await store.get();
    expect(load.mock.calls.length).toBeLessThanOrEqual(3); // first load + one reload + one settle reload
  });

  it('one document that cannot be mapped is skipped and counted, not fatal', async () => {
    const broken = structuredClone(RAW) as any;
    broken.posts[0].category = 999999;
    const log = vi.fn();
    const store = createSnapshotStore({ load: async () => broken, log });
    const site = await store.get();
    expect(site.getPosts('en').length).toBeGreaterThan(0);
    expect(store.status().errors).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^skipped: posts\//));
  });
});
