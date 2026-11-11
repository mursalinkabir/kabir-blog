import type { CollectionConfig } from 'payload';
import { agentMayRename, isAdminField } from '../access';
import { agentTextGuard } from '../hooks/agentGuards';
import { invalidateAfterChange, invalidateAfterDelete } from '../hooks/invalidateSite';

/** The three subjects. The slug set is closed on purpose: adding a category is a site change too (route, icon). */
export const Categories: CollectionConfig = {
  slug: 'categories',
  access: agentMayRename,
  hooks: { beforeChange: [agentTextGuard], afterChange: [invalidateAfterChange], afterDelete: [invalidateAfterDelete] },
  admin: { useAsTitle: 'slug', defaultColumns: ['slug', 'name'] },
  fields: [
    {
      name: 'slug',
      type: 'select',
      required: true,
      unique: true,
      access: { update: isAdminField },
      options: [
        { label: 'Tech', value: 'tech' },
        { label: 'Finance', value: 'finance' },
        { label: 'Japan life', value: 'japan-life' },
      ],
    },
    { name: 'name', type: 'text', localized: true, required: true },
  ],
};
