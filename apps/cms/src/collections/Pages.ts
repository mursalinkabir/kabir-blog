import type { CollectionConfig } from 'payload';
import { readerReadsAdminWrites } from '../access';
import { articleEditor } from '../blocks';
import { lockSlugAfterPublish, validateSlug } from '../hooks/slug';

/** Standalone pages such as About. A page exists in a language only where its title and text exist. */
export const Pages: CollectionConfig = {
  slug: 'pages',
  access: readerReadsAdminWrites,
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
  versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 25 },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: validateSlug,
      hooks: { beforeValidate: [lockSlugAfterPublish] },
    },
    { name: 'content', type: 'richText', localized: true, required: true, editor: articleEditor },
  ],
};
