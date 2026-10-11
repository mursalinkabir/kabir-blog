import type { FieldHook } from 'payload';

/** Published URLs are permanent (docs/PLAN.md): once a document has been published its slug cannot change. */
export const lockSlugAfterPublish: FieldHook = ({ value, originalDoc, operation }) => {
  if (operation === 'update' && originalDoc?._status === 'published' && originalDoc.slug && value !== originalDoc.slug) {
    throw new Error(
      `The slug "${originalDoc.slug}" is published and is part of a public URL, so it cannot change. ` +
        `Add a redirect first if the address must move.`,
    );
  }
  return value;
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const validateSlug = (value: string | null | undefined) =>
  typeof value === 'string' && SLUG_PATTERN.test(value)
    ? true
    : 'Use lowercase letters, digits and single dashes only (for example: my-first-post).';
