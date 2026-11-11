// The committed sample content (apps/site/src/content/fixtures), already in the shape the site reads. Used by tests and
// the parity run only; the server reads the database. Moves to apps/cms/fixtures when the Astro site is retired.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { SiteData } from './site';

const here = path.dirname(new URL(import.meta.url).pathname);
export const defaultFixturesDir = path.resolve(here, '../../../../site/src/content/fixtures');

export function loadFixtureData(dir: string = defaultFixturesDir): SiteData {
  const one = <T>(name: string): T => JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as T;
  const many = <T>(folder: string): T[] =>
    readdirSync(path.join(dir, folder))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(readFileSync(path.join(dir, folder, f), 'utf8')) as T);
  return {
    posts: many('posts'),
    projects: many('projects'),
    pages: many('pages'),
    site: one('site'),
    now: one('now'),
    uses: one('uses'),
    resume: one('resume'),
  };
}
