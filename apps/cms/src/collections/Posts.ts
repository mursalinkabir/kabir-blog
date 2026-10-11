import type { CollectionConfig } from 'payload';
import { readerReadsAdminWrites } from '../access';
import { articleEditor } from '../blocks';
import { lockSlugAfterPublish, validateSlug } from '../hooks/slug';
import { requiredRichTextWhenPublished, requiredTextWhenPublished } from '../hooks/requiredWhenPublished';

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: readerReadsAdminWrites,
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'pubDate', '_status', 'updatedAt'],
    description: 'Save keeps a draft. Publish makes it public (and, once wired in Phase 7, rebuilds the site).',
  },
  versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 25 },
  fields: [
    { name: 'title', type: 'text', localized: true, validate: requiredTextWhenPublished('Title') },
    {
      name: 'description',
      type: 'text',
      localized: true,
      maxLength: 160,
      validate: requiredTextWhenPublished('Description'),
      admin: { description: 'One sentence for cards, search results and social previews (up to 160 characters).' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: validateSlug,
      hooks: { beforeValidate: [lockSlugAfterPublish] },
      admin: { description: 'Part of the public URL. Permanent once published.' },
    },
    { name: 'category', type: 'relationship', relationTo: 'categories', required: true },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    {
      name: 'pubDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'updatedDate', type: 'date', admin: { description: 'Set only when the post changed in a way readers should know about.' } },
    { name: 'hero', type: 'upload', relationTo: 'media', label: 'Cover image' },
    {
      name: 'series',
      type: 'group',
      fields: [
        { name: 'name', type: 'text' },
        { name: 'part', type: 'number', min: 1 },
      ],
    },
    { name: 'toc', type: 'checkbox', defaultValue: true, label: 'Show a contents list' },
    {
      name: 'publishedIn',
      type: 'checkbox',
      localized: true,
      defaultValue: false,
      label: 'Visible in this language',
      admin: {
        position: 'sidebar',
        description:
          'Each language is published on its own. A language with this off (or with a missing title, summary, ' +
          'text or image description) gets no page: it never falls back to another language.',
      },
    },
    { name: 'content', type: 'richText', localized: true, editor: articleEditor, validate: requiredRichTextWhenPublished('Text') },
  ],
};
