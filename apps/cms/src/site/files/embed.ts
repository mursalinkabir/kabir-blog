import { embedDocument } from '../lib/embeds';
import type { Site } from '../data/site';

export const EMBED_ID = /^[0-9a-f]{24}$/;

/** The document served at /embeds/<id>.html, or null for an id no published page uses. */
export function embedHtml(site: Site, id: string): string | null {
  if (!EMBED_ID.test(id)) return null;
  const e = site.embeds().get(id);
  return e ? embedDocument(e.html, e.title, e.lang) : null;
}
