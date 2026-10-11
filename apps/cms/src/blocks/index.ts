import type { Block } from 'payload';
import {
  BlocksFeature,
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  ChecklistFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  SubscriptFeature,
  SuperscriptFeature,
  UnderlineFeature,
  UnorderedListFeature,
  BlockquoteFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical';

/*
 * Block slugs are the `blockType` strings the site's renderer switches on
 * (apps/site/src/components/Node.astro, lib/lexical/inline.ts). Rename one here and the build fails loudly there.
 */

const LANGUAGES = [
  'text',
  'bash',
  'sh',
  'ts',
  'tsx',
  'js',
  'json',
  'yaml',
  'toml',
  'html',
  'css',
  'astro',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'sql',
  'diff',
  'dockerfile',
  'nginx',
].map((value) => ({ label: value, value }));

export const CodeBlock: Block = {
  slug: 'code',
  labels: { singular: 'Code', plural: 'Code blocks' },
  fields: [
    { name: 'language', type: 'select', required: true, defaultValue: 'text', options: LANGUAGES },
    { name: 'filename', type: 'text', admin: { description: 'Shown as the tab title, for example src/lib/posts.ts' } },
    { name: 'code', type: 'code', required: true },
    { name: 'highlightLines', type: 'text', admin: { description: 'Lines to mark, for example 4,6-8' } },
  ],
};

export const TerminalBlock: Block = {
  slug: 'terminal',
  labels: { singular: 'Terminal', plural: 'Terminal blocks' },
  fields: [
    {
      name: 'command',
      type: 'textarea',
      required: true,
      admin: { description: 'What the reader runs. The copy button copies only this.' },
    },
    { name: 'output', type: 'textarea', admin: { description: 'What it prints. Not copied.' } },
  ],
};

export const JpInlineBlock: Block = {
  slug: 'jp',
  labels: { singular: 'Japanese term', plural: 'Japanese terms' },
  fields: [
    { name: 't', type: 'text', required: true, label: 'Japanese (kanji or kana)' },
    { name: 'r', type: 'text', required: true, label: 'Reading in Romaji (always shown)' },
    { name: 'en', type: 'text', required: true, label: 'Meaning (shown on hover or tap)' },
  ],
};

const inlineFormatting = () => [
  BoldFeature(),
  ItalicFeature(),
  UnderlineFeature(),
  StrikethroughFeature(),
  InlineCodeFeature(),
  SubscriptFeature(),
  SuperscriptFeature(),
  // Custom URLs only. The site renders `fields.url`; internal document links would have no URL to print.
  LinkFeature({ enabledCollections: [] }),
];

/** The small editor inside a callout: text, lists, links and Japanese terms; no nested blocks. */
const calloutEditor = lexicalEditor({
  features: [
    ParagraphFeature(),
    ...inlineFormatting(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlocksFeature({ inlineBlocks: [JpInlineBlock] }),
    InlineToolbarFeature(),
  ],
});

export const CalloutBlock: Block = {
  slug: 'callout',
  labels: { singular: 'Callout', plural: 'Callouts' },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'note',
      options: [
        { label: 'Note', value: 'note' },
        { label: 'Warning', value: 'warn' },
        { label: 'Danger', value: 'danger' },
      ],
    },
    { name: 'title', type: 'text', admin: { description: 'Optional. Defaults to the kind ("Note").' } },
    { name: 'body', type: 'richText', editor: calloutEditor, required: true },
  ],
};

export const FigureBlock: Block = {
  slug: 'figure',
  labels: { singular: 'Figure', plural: 'Figures' },
  fields: [
    { name: 'media', type: 'upload', relationTo: 'media', required: true },
    { name: 'caption', type: 'text' },
    { name: 'credit', type: 'text' },
  ],
};

export const GalleryStripBlock: Block = {
  slug: 'gallery-strip',
  labels: { singular: 'Photo strip', plural: 'Photo strips' },
  fields: [{ name: 'media', type: 'upload', relationTo: 'media', hasMany: true, required: true, minRows: 2 }],
};

export const DiagramBlock: Block = {
  slug: 'diagram',
  labels: { singular: 'Diagram', plural: 'Diagrams' },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'd2',
      options: [
        { label: 'D2', value: 'd2' },
        { label: 'Mermaid (not rendered yet; shows as source)', value: 'mermaid' },
      ],
    },
    { name: 'source', type: 'code', required: true, admin: { description: 'Rendered to an SVG when the site is built.' } },
    { name: 'alt', type: 'text', admin: { description: 'One sentence saying what the diagram shows.' } },
  ],
};

/**
 * The article editor. Everything the site can render and nothing it cannot: no upload node (use a Figure block),
 * no internal links, no alignment or indent. A feature the renderer does not know would fail the site build.
 */
export const articleEditor = lexicalEditor({
  features: [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    ...inlineFormatting(),
    UnorderedListFeature(),
    OrderedListFeature(),
    ChecklistFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    EXPERIMENTAL_TableFeature(),
    BlocksFeature({
      blocks: [CodeBlock, TerminalBlock, CalloutBlock, FigureBlock, GalleryStripBlock, DiagramBlock],
      inlineBlocks: [JpInlineBlock],
    }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
});
