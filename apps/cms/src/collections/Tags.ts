import type { CollectionConfig } from 'payload';
import { readerReadsAdminWrites } from '../access';
import { validateSlug } from '../hooks/slug';

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: readerReadsAdminWrites,
  admin: { useAsTitle: 'slug', defaultColumns: ['slug', 'name'] },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, validate: validateSlug },
    // A tag with no name in a language is simply not listed in that language.
    { name: 'name', type: 'text', localized: true, required: true },
  ],
};
