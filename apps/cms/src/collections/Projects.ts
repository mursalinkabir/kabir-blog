import type { CollectionConfig } from 'payload';
import { readerReadsAdminWrites } from '../access';
import { articleEditor } from '../blocks';
import { lockSlugAfterPublish, validateSlug } from '../hooks/slug';

export const Projects: CollectionConfig = {
  slug: 'projects',
  access: readerReadsAdminWrites,
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'status', 'featured', 'order', '_status'] },
  versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 25 },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'summary', type: 'text', localized: true, required: true, maxLength: 200 },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: validateSlug,
      hooks: { beforeValidate: [lockSlugAfterPublish] },
    },
    {
      name: 'status',
      type: 'select',
      // Drafts add a `_status` field whose Postgres enum is also called enum_projects_status. Without a distinct
      // name for this one the migration fails ("invalid input value for enum ... active").
      enumName: 'enum_projects_state',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Maintained', value: 'maintained' },
        { label: 'Archived', value: 'archived' },
        { label: 'Idea', value: 'idea' },
      ],
    },
    { name: 'stack', type: 'array', fields: [{ name: 'label', type: 'text', required: true }] },
    { name: 'repo', type: 'text', admin: { description: 'https://... link to the source, if public.' } },
    {
      name: 'links',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    { name: 'order', type: 'number', defaultValue: 100, admin: { description: 'Lower numbers first.' } },
    { name: 'hero', type: 'upload', relationTo: 'media' },
    { name: 'content', type: 'richText', localized: true, required: true, editor: articleEditor },
  ],
};
