import type { PayloadRequest } from 'payload';
import { expect, it, vi } from 'vitest';
import { markdownToLexical } from '../src/lib/markdown';
import { postTools } from '../src/mcp/posts';

vi.mock('../src/mcp/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/mcp/shared')>()),
  reportLive: async () => ({ live: {}, notLive: {} }),
}));

it('publishes a bilingual draft with media IDs in its figure blocks', async () => {
  const updatedAt = '2026-11-28T00:00:00.000Z';
  const mediaIds = { en: 11, ja: 12 };
  const findByID = vi.fn(({ depth, locale }: { depth: number; locale: 'en' | 'ja' }) => {
    const id = mediaIds[locale];
    const content = markdownToLexical(`![](media:${id})`);
    if (depth > 0) Object.assign(content.root.children[0]!.fields as object, { media: { id } });
    return { updatedAt, slug: 'article', category: 1, content };
  });
  const update = vi.fn(({ data }: { data: { content: ReturnType<typeof markdownToLexical> } }) => {
    const { media } = data.content.root.children[0]!.fields as { media: unknown };
    if (typeof media !== 'number') throw new Error('The following fields are invalid: Content > Media');
  });
  const req = {
    user: { collection: 'users', role: 'agent', id: 2 },
    payload: { findByID, update, create: vi.fn() },
  } as unknown as PayloadRequest;
  const tool = postTools.find((candidate) => candidate.name === 'publish_post')!;

  const result = await tool.handler({ id: 7, languages: ['en', 'ja'], expected_updated_at: updatedAt }, req);

  expect(JSON.parse(result.content[0]!.text).results).toEqual({ en: { published: true }, ja: { published: true } });
  expect(update.mock.calls.map(([{ data }]) => data.content.root.children[0]!.fields)).toEqual([
    expect.objectContaining({ media: 11 }),
    expect.objectContaining({ media: 12 }),
  ]);
});
