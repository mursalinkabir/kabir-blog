import type { TextFieldSingleValidation } from 'payload';

/**
 * A language is optional until it is switched on. "Visible in this language" (publishedIn) is itself per language,
 * so a field is required in exactly the languages the post is published in. That is what lets a post exist in
 * Japanese only (or English only) without inventing a title in the other language, and it matches the site's rule:
 * a language gets a page only when every required field exists in it.
 */
const isOn = (siblingData: unknown) => Boolean((siblingData as { publishedIn?: boolean } | undefined)?.publishedIn);

export const requiredTextWhenPublished =
  (label: string): TextFieldSingleValidation =>
  (value, { siblingData }) =>
    isOn(siblingData) && (typeof value !== 'string' || value.trim() === '')
      ? `${label} is required when "Visible in this language" is on.`
      : true;

type Lexical = { root?: { children?: { type?: string; children?: unknown[] }[] } };

const emptyEditor = (v: Lexical | null | undefined) =>
  !v?.root?.children?.length || v.root.children.every((n) => n.type === 'paragraph' && !(n.children && n.children.length));

/** Rich text validator: same rule, for the article editor's saved value. */
export const requiredRichTextWhenPublished =
  (label: string) =>
  (value: unknown, { siblingData }: { siblingData: unknown }) =>
    isOn(siblingData) && emptyEditor(value as Lexical) ? `${label} is required when "Visible in this language" is on.` : true;
