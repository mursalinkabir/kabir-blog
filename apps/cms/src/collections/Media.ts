import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CollectionConfig } from 'payload';
import { agentMayCreate } from '../access';
import { stripImageMetadata } from '../hooks/stripImageMetadata';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const webp = (width: number) => ({
  name: `w${width}`,
  width,
  // Keep the aspect ratio: only the width is fixed.
  height: undefined,
  formatOptions: { format: 'webp' as const, options: { quality: 72, effort: 5 } },
});

/**
 * Every image on the site. The site prints only the generated sizes (never the original), so the three sizes
 * below are the whole public surface. Alt text is required in every language: an image with no description in a
 * language is a content gap, not something to paper over with another language.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: agentMayCreate,
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'credit', 'updatedAt'],
    description:
      'Photo checklist before uploading: house exterior, street and station signs, car number plate, name plate, ' +
      'reflections, faces of family members. Location is stripped from every upload.',
  },
  upload: {
    staticDir: path.resolve(dirname, '../../media'),
    // Rasters only. SVG is refused on purpose: it can carry script, and the original may be served from a media domain.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    imageSizes: [webp(480), webp(960), webp(1600)],
    adminThumbnail: 'w480',
    focalPoint: true,
    withMetadata: false,
  },
  hooks: { beforeOperation: [stripImageMetadata] },
  fields: [
    {
      name: 'alt',
      type: 'text',
      localized: true,
      required: true,
      admin: { description: 'Describe the image for someone who cannot see it. Required in English and Japanese.' },
    },
    { name: 'caption', type: 'text', localized: true },
    {
      name: 'credit',
      type: 'text',
      admin: { description: 'For example "Photo: Name on Unsplash". Printed under the image.' },
    },
  ],
};
