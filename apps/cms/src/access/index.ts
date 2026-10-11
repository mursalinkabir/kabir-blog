import type { Access, FieldAccess } from 'payload';

/**
 * Nothing in this CMS is public. The admin sits behind Cloudflare Access, and the REST API answers only
 * authenticated callers: an admin session, or a read-only API key (the site builder, the preview server).
 */
export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user);

export const isAdmin: Access = ({ req: { user } }) => Boolean(user && user.role === 'admin');

export const isAdminField: FieldAccess = ({ req: { user } }) => Boolean(user && user.role === 'admin');

/** Standard rule: any signed-in caller reads (builders and previewers are readers); only admins write. */
export const readerReadsAdminWrites = {
  read: isLoggedIn,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};
