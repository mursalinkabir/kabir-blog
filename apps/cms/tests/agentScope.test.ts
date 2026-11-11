import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addedStrings,
  docProblems,
  globalProblems,
  privacyProblems,
  restrictedBlockProblems,
  socialHostAllowed,
  staleProblem,
} from '../src/lib/agentPolicy';
import { markdownFromLexical, markdownToLexical, preservedBlocks, type LexicalRoot } from '../src/lib/markdown';

const embed = (id: string, html = '<p>x</p>') => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id, blockType: 'html-embed', html, title: 't' },
});
const withBlocks = (...blocks: unknown[]): LexicalRoot => {
  const doc = markdownToLexical('A fairly ordinary sentence for a test. '.repeat(10));
  doc.root.children.push(...(blocks as never[]));
  return doc;
};

describe("restrictedBlockProblems(): a person's embeds may stay, an agent's may not appear", () => {
  it('refuses an embed when there is no baseline', () => {
    expect(restrictedBlockProblems(withBlocks(embed('a')))).toEqual(['HTML embeds can only be added by an admin.']);
  });
  it('allows an embed that is identical in the baseline', () => {
    const base = withBlocks(embed('a'));
    expect(restrictedBlockProblems(withBlocks(embed('a')), base)).toEqual([]);
  });
  it('refuses an existing id whose contents changed, and a new id', () => {
    const base = withBlocks(embed('a'));
    expect(restrictedBlockProblems(withBlocks(embed('a', '<script>1</script>')), base)).toHaveLength(1);
    expect(restrictedBlockProblems(withBlocks(embed('a'), embed('b')), base)).toHaveLength(1);
  });
  it('compares blocks regardless of key order', () => {
    const base = withBlocks({
      type: 'block',
      version: 2,
      format: '',
      fields: { id: 'a', blockType: 'html-embed', html: '<p>x</p>', title: 't' },
    });
    const reordered = withBlocks({
      type: 'block',
      version: 2,
      format: '',
      fields: { title: 't', html: '<p>x</p>', blockType: 'html-embed', id: 'a', blockName: '' },
    });
    expect(restrictedBlockProblems(reordered, base)).toEqual([]);
  });
  it('treats a photo strip the same way', () => {
    const strip = { type: 'block', version: 2, format: '', fields: { id: 's', blockType: 'gallery-strip' } };
    expect(restrictedBlockProblems(withBlocks(strip))[0]).toMatch(/Photo strips/);
    expect(restrictedBlockProblems(withBlocks(strip), withBlocks(strip))).toEqual([]);
  });
  it('round trip: an agent editing Markdown around an embed keeps it byte for byte', () => {
    const base = withBlocks(embed('keepme'));
    const md = markdownFromLexical(base);
    expect(md).toContain('[[keep:keepme]]');
    const edited = markdownToLexical(md.replace('ordinary', 'EDITED'), { preserved: preservedBlocks(base) });
    expect(restrictedBlockProblems(edited, base)).toEqual([]);
  });
});

describe('docProblems(): pages and projects', () => {
  const body = markdownToLexical(
    'A short but real paragraph about this page, long enough for the page minimum to be met easily. It says who runs the site and what it is for.',
  );
  const ok = { kind: 'page' as const, locale: 'en' as const, title: 'About', slug: 'about', content: body };
  it('passes a short page that a post would reject', () => expect(docProblems(ok)).toEqual([]));
  it('needs a summary for a project, within 200 characters', () => {
    expect(docProblems({ ...ok, kind: 'project' }).join()).toMatch(/no en summary/);
    expect(docProblems({ ...ok, kind: 'project', summary: 'x'.repeat(201) }).join()).toMatch(/limit is 200/);
    expect(docProblems({ ...ok, kind: 'project', summary: 'A project.' })).toEqual([]);
  });
  it('requires https links and scans for private data', () => {
    expect(docProblems({ ...ok, urls: ['http://example.com'] }).join()).toMatch(/not an https/);
    expect(docProblems({ ...ok, urls: ['javascript:alert(1)'] }).join()).toMatch(/not an https/);
    const phone = markdownToLexical('A real paragraph that is long enough for the minimum, call 090-1234-5678. More words follow here.');
    expect(docProblems({ ...ok, content: phone }).join()).toMatch(/Privacy/);
  });
  it('flags missing text per language', () => expect(docProblems({ ...ok, locale: 'ja', content: null }).join()).toMatch(/no ja text/));
});

describe('settings rules', () => {
  it('social links must be https on an allowed host', () => {
    expect(socialHostAllowed('https://github.com/me')).toBe(true);
    expect(socialHostAllowed('https://www.linkedin.com/in/me')).toBe(true);
    expect(socialHostAllowed('https://gist.github.com/me')).toBe(true);
    expect(socialHostAllowed('http://github.com/me')).toBe(false);
    expect(socialHostAllowed('https://evilgithub.com/me')).toBe(false);
    expect(socialHostAllowed('https://github.com.evil.example/me')).toBe(false);
    expect(socialHostAllowed('not a url')).toBe(false);
  });
  it('site and resume link rules', () => {
    expect(globalProblems('site', { socials: [{ url: 'https://example.org/x' }] })).toHaveLength(1);
    expect(globalProblems('site', { socials: [{ url: 'https://github.com/x' }] })).toEqual([]);
    expect(globalProblems('resume', { basics: { url: 'http://x.example', profiles: [{ url: 'https://github.com/x' }] } })).toHaveLength(1);
    expect(globalProblems('now', {})).toEqual([]);
  });
  it("internal paths are fine, an older odd link is not the agent's problem, a new one is", () => {
    const body = markdownToLexical(
      'A short but real paragraph about this page, long enough for the page minimum to be met easily. It says who runs the site and what it is for.',
    );
    const base = { kind: 'project' as const, locale: 'en' as const, title: 'T', summary: 'S', slug: 's', content: body };
    expect(docProblems({ ...base, urls: ['/projects/homelab/', 'https://example.com'] })).toEqual([]);
    expect(docProblems({ ...base, urls: ['//evil.example/x'] }).join()).toMatch(/not an https/);
    expect(docProblems({ ...base, urls: ['ftp://old.example/x'], knownUrls: ['ftp://old.example/x'] })).toEqual([]);
    expect(
      globalProblems(
        'resume',
        { projects: [{ url: '/projects/homelab/' }, { url: 'ftp://old.example' }] },
        { projects: [{ url: 'ftp://old.example' }] },
      ),
    ).toEqual([]);
    expect(globalProblems('resume', { projects: [{ url: 'ftp://new.example' }] }, {})).toHaveLength(1);
  });
  it('the privacy scan reads only text that is new', () => {
    const before = { basics: { summary: 'Reach me at hello@smkabir.com or private.person@gmail.com' } };
    expect(privacyProblems(before, before)).toEqual([]);
    expect(addedStrings({ a: 'old', b: 'new' }, { a: 'old' })).toEqual(['new']);
    expect(privacyProblems({ note: 'Call 090-1234-5678.' }, { note: 'nothing' }).join()).toMatch(/phone/);
  });
  it('ignores id and email fields when comparing', () => expect(addedStrings({ id: 'x', email: 'a@b.co', t: 'z' }, {})).toEqual(['z']));
});

describe('staleProblem()', () => {
  it('requires the version that was read', () =>
    expect(staleProblem(undefined, '2026-11-01T00:00:00.000Z')).toMatch(/expected_updated_at/));
  it('accepts the same instant in any spelling, refuses a different one', () => {
    expect(staleProblem('2026-11-01T00:00:00Z', '2026-11-01T00:00:00.000Z')).toBeUndefined();
    expect(staleProblem('2026-11-01T00:00:00.000Z', '2026-11-01T00:00:01.000Z')).toMatch(/changed after you read it/);
  });
});

describe('fixtures survive an agent edit (Markdown round trip)', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/src/content/fixtures');
  const files = ['posts', 'projects', 'pages'].flatMap((d) => readdirSync(path.join(dir, d)).map((f) => path.join(dir, d, f)));
  const lexicals = (o: unknown, out: LexicalRoot[] = []): LexicalRoot[] => {
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (r.root && typeof r.root === 'object' && Array.isArray((r.root as { children?: unknown }).children))
        out.push(r as unknown as LexicalRoot);
      else Object.values(r).forEach((v) => lexicals(v, out));
    }
    return out;
  };
  it('has fixtures to test', () => expect(files.length).toBeGreaterThan(5));
  for (const file of files) {
    it(path.basename(file), () => {
      for (const doc of lexicals(JSON.parse(readFileSync(file, 'utf8')))) {
        // Fixtures name pictures by a label (m1); in the CMS they are numeric ids. Compare with one id throughout.
        const md = markdownFromLexical(doc).replace(/media:[A-Za-z0-9_-]+/g, 'media:1');
        const back = markdownToLexical(md, { preserved: preservedBlocks(doc) });
        // Saving what get_* returned must not add or alter any embed or photo strip, and must say the same thing again.
        expect(restrictedBlockProblems(back, doc)).toEqual([]);
        expect(markdownFromLexical(back)).toBe(md);
      }
    });
  }
});
