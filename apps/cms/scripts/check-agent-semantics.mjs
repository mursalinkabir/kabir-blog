// Which copy of a post is live? Payload keeps a published copy and a draft copy, and promotes the WHOLE latest draft
// (every language) on any non-draft save. This proves the agent path never lets an unreviewed edit go live.
//
//   AGENT_AUTO_PUBLISH=1 AGENT_MAX_PUBLISHES_PER_DAY=20 pnpm dev   (then)   node scripts/check-agent-semantics.mjs
//
// Reads the live copy with the builder's read-only key (CMS_API_KEY in .dev-credentials), exactly as the site build does.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.CMS_URL ?? 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('local CMS only');
const creds = Object.fromEntries(
  readFileSync(new URL('../.dev-credentials', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const client = new Client({ name: 'semantics', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', BASE), {
    requestInit: { headers: { Authorization: `Bearer ${creds.AGENT_MCP_KEY}` } },
  }),
);
const call = async (name, args) => {
  const text = (await client.callTool({ name, arguments: args })).content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};
const live = async (slug) => {
  const r = await fetch(`${BASE}/api/posts?where[slug][equals]=${slug}&locale=all&fallback-locale=none&draft=false&depth=0`, {
    headers: { Authorization: `users API-Key ${creds.CMS_API_KEY}` },
  });
  const d = (await r.json()).docs?.[0];
  return d ? { status: d._status, title: d.title ?? {}, visible: d.publishedIn ?? {} } : null;
};

let pass = 0,
  fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
};

const s = Date.now().toString(36);
const slug = `zz-agent-test-sem-${s}`;
const EN = 'A sentence that is long enough to pass the minimum length rule. '.repeat(15);
const JA = 'この文章は最小の長さを満たすために、少し長めに書いてあります。'.repeat(14);

const d = await call('create_draft', {
  language: 'en',
  title: `Original title ${s}`,
  description: 'Checking which copy is live after each step.',
  slug,
  category: 'tech',
  markdown: EN,
});
ok('a new draft is not live', (await live(slug))?.status === 'draft' && !(await live(slug))?.visible?.en);

const p1 = await call('publish_post', { id: d.id, languages: ['en'] });
ok('English publishes', p1.results?.en?.published === true, JSON.stringify(p1));
let l = await live(slug);
ok(
  'the live copy is published, English visible, original title',
  l?.status === 'published' && l.visible.en === true && l.title.en === `Original title ${s}`,
  JSON.stringify(l),
);

await call('update_draft', { id: d.id, language: 'en', title: `EDITED title ${s}` });
l = await live(slug);
ok('a draft edit does not change the live copy', l?.title.en === `Original title ${s}`, JSON.stringify(l));

await call('update_draft', {
  id: d.id,
  language: 'ja',
  title: `日本語のタイトル ${s}`,
  description: '各手順のあとで、どちらのコピーが公開されているかを確かめる記事です。',
  markdown: JA,
  visible: true,
});
l = await live(slug);
ok('a Japanese draft is not live until published', !l?.visible?.ja && !l?.title?.ja, JSON.stringify(l));

const p2 = await call('publish_post', { id: d.id, languages: ['ja'] });
ok('Japanese publishes', p2.results?.ja?.published === true, JSON.stringify(p2));
l = await live(slug);
ok(
  'both languages are live, with the edited English title',
  l?.visible.en === true && l.visible.ja === true && l.title.en === `EDITED title ${s}` && Boolean(l.title.ja),
  JSON.stringify(l),
);

// A bad pending edit in Japanese must stop an English publish, because the whole draft would go live.
await call('update_draft', { id: d.id, language: 'ja', markdown: '短い。' });
await call('update_draft', { id: d.id, language: 'en', title: `SECOND edit ${s}` });
const p3 = await call('publish_post', { id: d.id, languages: ['en'] });
ok(
  'an English publish is refused while a Japanese edit breaks the rules',
  p3.results?.en?.published === false && /ja version would go live/.test(p3.results.en.reason),
  JSON.stringify(p3),
);
l = await live(slug);
ok('and nothing changed live', l?.title.en === `EDITED title ${s}`, JSON.stringify(l));

const hide = await call('update_draft', { id: d.id, language: 'ja', visible: false });
ok('hiding Japanese is a draft change', hide.changed?.includes('publishedIn'), JSON.stringify(hide));
const p4 = await call('publish_post', { id: d.id, languages: ['en'] });
ok('English now publishes, with Japanese hidden', p4.results?.en?.published === true, JSON.stringify(p4));
l = await live(slug);
ok('live: English updated, Japanese not visible', l?.title.en === `SECOND edit ${s}` && l.visible.ja === false, JSON.stringify(l));

const down = await call('unpublish_post', { id: d.id });
ok('unpublish takes the whole post offline', down.live === false, JSON.stringify(down));
l = await live(slug);
ok('the live copy is a draft again', l?.status === 'draft', JSON.stringify(l));

await client.close();
console.log(`\nagent semantics: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
