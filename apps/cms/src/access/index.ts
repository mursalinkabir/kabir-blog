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

/** Admins write anything; an AI agent may create posts and may change only posts it created itself. */
export const postAccess = {
  read: isLoggedIn,
  create: ({ req: { user } }: Parameters<Access>[0]) => ['admin', 'agent'].includes(roleOf(user) ?? ''),
  update: ({ req: { user } }: Parameters<Access>[0]) => {
    const role = roleOf(user);
    if (role === 'admin') return true;
    if (role === 'agent') return { createdByAgent: { equals: true } };
    return false;
  },
  // Nobody deletes through the API but an admin: an agent cannot remove history or its own mistakes.
  delete: isAdmin,
};

/** Agents may upload images and create tags; everything else on those collections stays admin-only. */
export const agentMayCreate = {
  read: isLoggedIn,
  create: ({ req: { user } }: Parameters<Access>[0]) => ['admin', 'agent'].includes(roleOf(user) ?? ''),
  update: isAdmin,
  delete: isAdmin,
};
