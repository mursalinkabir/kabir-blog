import type { CollectionConfig } from 'payload';
import { isAdmin, isLoggedIn, roleOf } from '../access';

/**
 * Admin users and read-only API users. There is no public registration: the first user is created through the admin
 * (or by the seed script locally), and everyone after that is created by an admin.
 * Cloudflare Access is the outer wall; this lockout is the second.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'role'] },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 12 * 60 * 60,
    // A read-only "builder" (CI) and "preview" (preview server) are separate users with their own key,
    // so either can be revoked on its own.
    useAPIKey: true,
  },
  access: {
    // Anyone signed in may see the user list (needed for relationships in the admin); only admins change it.
    read: isLoggedIn,
    create: isAdmin,
    update: ({ req: { user } }) => (roleOf(user) === 'admin' ? true : roleOf(user) && user ? { id: { equals: user.id } } : false),
    delete: isAdmin,
    admin: ({ req: { user } }) => roleOf(user) === 'admin',
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'reader',
      saveToJWT: true,
      options: [
        { label: 'Admin (full access)', value: 'admin' },
        { label: 'Reader (read-only API key: builder, preview)', value: 'reader' },
        {
          label: 'Agent (MCP: writes its own posts; publishing is gated, see docs/agents.md)',
          value: 'agent',
        },
      ],
      access: { update: ({ req: { user } }) => roleOf(user) === 'admin' },
    },
  ],
};
