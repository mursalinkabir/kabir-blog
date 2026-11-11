/** Joins class names, skipping falsy ones (the Astro `class:list` helper). */
export const cx = (...parts: (string | false | null | undefined)[]): string | undefined => parts.filter(Boolean).join(' ') || undefined;
