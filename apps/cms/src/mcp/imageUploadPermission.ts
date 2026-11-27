import type { PayloadRequest } from 'payload';
import { roleOf } from '../access';

const agentKey = { 'user.role': { equals: 'agent' } };

export async function listAgentImageUploadPermissions(req: PayloadRequest) {
  if (roleOf(req.user) !== 'admin') throw new Error('Administrator access required');

  const { docs } = await req.payload.find({
    collection: 'payload-mcp-api-keys',
    overrideAccess: true,
    req,
    where: agentKey,
    depth: 0,
    pagination: false,
    sort: 'label',
    select: { label: true, 'payload-mcp-tool': { uploadImage: true } },
  });
  return docs.map((doc) => ({ id: doc.id, label: doc.label, enabled: doc['payload-mcp-tool']?.uploadImage === true }));
}

export async function setAgentImageUpload(req: PayloadRequest, id: number, enabled: boolean) {
  if (roleOf(req.user) !== 'admin') throw new Error('Administrator access required');

  const { docs, errors } = await req.payload.update({
    collection: 'payload-mcp-api-keys',
    overrideAccess: true,
    overrideLock: false,
    req,
    where: { id: { equals: id }, ...agentKey },
    limit: 1,
    depth: 0,
    select: { 'payload-mcp-tool': { uploadImage: true } },
    data: { 'payload-mcp-tool': { uploadImage: enabled } },
  });
  if (errors.length) throw new Error('Could not save the image upload permission');
  if (!docs.length) throw new Error('Agent key not found');
}
