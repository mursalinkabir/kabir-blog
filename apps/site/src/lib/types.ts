// Shapes mirror what Payload returns for `?locale=all&fallback-locale=none` (see docs/PLAN.md, "Content model").
// Phase 2 replaces these with the generated `payload-types.ts`.
import type { Locale } from '~/i18n';
import type { LexicalRoot } from './lexical/types';

/** A localized field: one value per locale. A missing key means "not written in that locale". */
export type Localized<T> = Partial<Record<Locale, T>>;

export interface Media {
  id: string;
  url: string;
  filename?: string;
  mimeType?: string;
  width: number;
  height: number;
  alt: Localized<string>;
  caption?: Localized<string>;
  credit?: string;
  sizes?: Record<string, { url: string; width: number; height: number }>;
}

export interface Category {
  id: string;
  slug: 'tech' | 'finance' | 'japan-life';
  name: Localized<string>;
}

export interface Tag {
  id: string;
  slug: string;
  name: Localized<string>;
}

type Status = 'draft' | 'published';

export interface Post {
  id: string;
  _status: Status;
  slug: string;
  pubDate: string;
  updatedDate?: string;
  category: Category;
  tags: Tag[];
  hero?: Media;
  series?: { name: string; part: number };
  toc: boolean;
  publishedIn: Localized<boolean>;
  title: Localized<string>;
  description: Localized<string>;
  content: Localized<LexicalRoot>;
}

export interface Project {
  id: string;
  _status: Status;
  slug: string;
  status: 'active' | 'maintained' | 'archived' | 'idea';
  stack: string[];
  repo?: string;
  links: { label: string; url: string }[];
  featured: boolean;
  order: number;
  hero?: Media;
  title: Localized<string>;
  summary: Localized<string>;
  content: Localized<LexicalRoot>;
}

export interface Page {
  id: string;
  _status: Status;
  slug: string;
  title: Localized<string>;
  content: Localized<LexicalRoot>;
}

export interface SiteGlobal {
  name: Localized<string>;
  tagline: Localized<string>;
  email: string;
  socials: { label: string; url: string }[];
  /** Primary nav keys, then the keys that live under "More". */
  nav: string[];
  navMore: string[];
}

export interface NowGlobal {
  updatedAt: string;
  content: Localized<LexicalRoot>;
}

export interface UsesGlobal {
  groups: { id: string; title: Localized<string>; items: { id: string; name: Localized<string>; note?: Localized<string> }[] }[];
}

export interface ResumeGlobal {
  updatedAt: string;
  basics: { name: string; label: string; email: string; url: string; summary: string; profiles: { network: string; url: string }[] };
  work: { id: string; name: string; position: string; startDate: string; endDate?: string; highlights: string[] }[];
  education: { id: string; institution: string; area: string; studyType: string; startDate: string; endDate?: string }[];
  skills: { id: string; name: string; keywords: string[] }[];
  projects: { id: string; name: string; description: string; url?: string }[];
  languages: { id: string; language: string; spoken: string; reading: string }[];
  certificates: { id: string; name: string; issuer: string; date: string }[];
}
