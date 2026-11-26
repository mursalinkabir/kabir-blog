import { renderToStaticMarkup } from 'react-dom/server';
import type { WidgetServerProps } from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorialDashboard } from '../src/admin/EditorialDashboard';

function props(role: 'admin' | 'reader', find = vi.fn()) {
  return {
    req: {
      user: { collection: 'users', role },
      payload: { config: { routes: { admin: '/admin' } }, find, logger: { error: vi.fn() } },
    },
  } as unknown as WidgetServerProps;
}

describe('editorial dashboard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows the posts-only Codex status and links to the agent log', async () => {
    vi.stubEnv('AGENT_AUTO_PUBLISH', '');
    vi.stubEnv('AGENT_POST_PUBLISH', '1');
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const html = renderToStaticMarkup(await EditorialDashboard(props('admin', find)));
    expect(html).toContain('Codex publishing');
    expect(html).toContain('Posts only');
    expect(html).toContain('href="/admin/collections/agent-log"');
  });

  it('links an incomplete Japanese-only draft to its editor without a broken preview', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 24, title: { ja: '下書き' }, slug: 'draft', updatedAt: '2026-11-23T00:00:00Z' }],
      })
      .mockResolvedValueOnce({ docs: [] });
    const html = renderToStaticMarkup(await EditorialDashboard(props('admin', find)));
    expect(html).toContain('href="/admin/collections/posts/24?locale=ja"');
    expect(html).toContain('下書き');
    expect(html).not.toContain('href="/preview/');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ draft: true, overrideAccess: false, locale: 'all' }));
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ draft: false, overrideAccess: false, locale: 'all' }));
  });

  it('does not fetch editorial data for a read-only user', async () => {
    const find = vi.fn();
    expect(await EditorialDashboard(props('reader', find))).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
});
