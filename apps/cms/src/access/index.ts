import type { Access, FieldAccess } from 'payload';

/**
 * Nothing in this CMS is public. The admin sits behind Cloudflare Access, and the REST API answers only
 * authenticated callers: an admin session, a read-only API key (the site builder, the preview server), or the AI
 * agent (through the MCP endpoint, which hands Payload the agent *user*).
 *
 * "Logged in" means a `users` account. The MCP plugin adds a second auth collection for its keys; a key used directly
 * against the REST API would otherwise count as logged in and be able to read drafts and the user list.
 */
type Who = { collection?: string; role?: string } | null | undefined;
const asUser = (u: unknown): Who => (u && typeof u === 'object' ? (u as Who) : null);

export const roleOf = (u: unknown): string | undefined => {
  const user = asUser(u);
  return user && user.collection === 'users' ? user.role : undefined;
};
const isUser = (u: unknown) => asUser(u)?.collection === 'users';

export const isLoggedIn: Access = ({ req: { user } }) => isUser(user);
export const isAdmin: Access = ({ req: { user } }) => roleOf(user) === 'admin';
export const isAdminField: FieldAccess = ({ req: { user } }) => roleOf(user) === 'admin';
export const isAgent: Access = ({ req: { user } }) => roleOf(user) === 'agent';

/** Standard rule: any signed-in caller reads (builders and previewers are readers); only admins write. */
export const readerReadsAdminWrites = {
  read: isLoggedIn,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};

const canWrite = ({ req: { user } }: Parameters<Access>[0]) => ['admin', 'agent'].includes(roleOf(user) ?? '');

/**
 * Posts, pages and projects: an AI agent may create and change any of them (what it may publish is decided by the
 * hooks in hooks/agentGuards.ts, not here). Nobody deletes through the API but an admin: an agent cannot remove
 * history or its own mistakes.
 */
export const agentWritesContent = {
  read: isLoggedIn,
  create: canWrite,
  update: canWrite,
  delete: isAdmin,
};
export const postAccess = agentWritesContent;

/** Tags and media: an agent creates and edits them; deleting stays with admins. */
export const agentMayCreate = agentWritesContent;

/** Categories are a closed set (a new one is a site change): an agent may rename them (the slug field is admin-only). */
export const agentMayRename = {
  read: isLoggedIn,
  create: isAdmin,
  update: canWrite,
  delete: isAdmin,
};

/** Site-wide settings (the four globals): readers read, admins and agents write. */
export const globalAccess = { read: isLoggedIn, update: canWrite };
