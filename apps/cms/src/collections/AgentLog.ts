import type { CollectionConfig } from 'payload';
import { isAdmin } from '../access';

/**
 * What the AI agent did and what the CMS did about it: every tool call, every publish, every refusal. Written by the
 * CMS itself (never through the API), read by admins. Also what the daily publish limit counts.
 */
export const AgentLog: CollectionConfig = {
  slug: 'agent-log',
  admin: { useAsTitle: 'summary', defaultColumns: ['createdAt', 'tool', 'outcome', 'locale', 'postId', 'summary'], group: 'MCP' },
  access: {
    read: isAdmin,
    create: () => false, // the CMS writes with overrideAccess
    update: () => false,
    delete: isAdmin,
  },
  timestamps: true,
  fields: [
    { name: 'tool', type: 'text', required: true, index: true },
    { name: 'outcome', type: 'select', required: true, index: true, options: ['ok', 'refused', 'error'] },
    // Plain ids, not relationships, on purpose: a foreign key makes the audit insert wait for locks on the post and
    // user rows, and the insert runs from inside the very save that holds them (found by the end-to-end check).
    { name: 'userId', type: 'number' },
    { name: 'postId', type: 'number', index: true },
    { name: 'locale', type: 'text' },
    { name: 'summary', type: 'text' },
    { name: 'detail', type: 'textarea' },
  ],
};
