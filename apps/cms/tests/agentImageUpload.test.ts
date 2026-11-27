import type { PayloadRequest } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { setAgentImageUpload } from '../src/mcp/imageUploadPermission';

function request(user: unknown) {
  const update = vi.fn().mockResolvedValue({ docs: [{ id: 23 }], errors: [] });
  return { req: { user, payload: { update } } as unknown as PayloadRequest, update };
}

describe('agent image upload permission', () => {
  it.each([null, { collection: 'users', role: 'agent' }, { collection: 'payload-mcp-api-keys', role: 'admin' }])(
    'rejects callers without an admin user session',
    async (user) => {
      const { req, update } = request(user);
      await expect(setAgentImageUpload(req, 23, true)).rejects.toThrow('Administrator access required');
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])('sets only the selected agent key upload flag to %s', async (enabled) => {
    const { req, update } = request({ collection: 'users', role: 'admin' });
    await setAgentImageUpload(req, 23, enabled);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      collection: 'payload-mcp-api-keys',
      overrideAccess: true,
      overrideLock: false,
      req,
      where: { id: { equals: 23 }, 'user.role': { equals: 'agent' } },
      limit: 1,
      depth: 0,
      select: { 'payload-mcp-tool': { uploadImage: true } },
      data: { 'payload-mcp-tool': { uploadImage: enabled } },
    });
  });

  it('reports when the target is missing or is not an agent key', async () => {
    const { req, update } = request({ collection: 'users', role: 'admin' });
    update.mockResolvedValue({ docs: [], errors: [] });
    await expect(setAgentImageUpload(req, 23, true)).rejects.toThrow('Agent key not found');
  });
});
