// End-to-end check of the agent path over the real MCP protocol, against a running local CMS.
//
//   node scripts/check-agent.mjs off     the CMS was started with AGENT_AUTO_PUBLISH=0 (publishing must be refused)
//   node scripts/check-agent.mjs on      the CMS was started with AGENT_AUTO_PUBLISH=1 AGENT_MAX_PUBLISHES_PER_DAY=3
//
// Needs apps/cms/.dev-credentials (AGENT_MCP_KEY, written by `pnpm agent-key`). Creates posts whose slug starts with
// "zz-agent-test-"; re-seed (SEED_RESET=1 pnpm seed) to clear them. Refuses any URL that is not localhost.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const mode = process.argv[2];
if (!['on', 'off'].includes(mode)) throw new Error('usage: check-agent.mjs on|off');
const BASE = process.env.CMS_URL ?? 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('local CMS only');
const creds = Object.fromEntries(
  readFileSync(new URL('../.dev-credentials', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((l) => !l.startsWith('#'))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const key = creds.AGENT_MCP_KEY;
if (!key) throw new Error('AGENT_MCP_KEY missing: run `pnpm agent-key`');

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 400)}` : ''}`);
  }
};

const client = new Client({ name: 'check-agent', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', BASE), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
);
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  let json;
  try {
    json = JSON.parse(text);
  } catch {}
  return { text, json, isError: text.startsWith('ERROR') };
};

const EN =
  `This is a test post written by the automated agent check. It exists to prove that a post can be written in Markdown, stored as structured content, and published only when every rule is met. `.repeat(
    4,
  ) +
  '\n\n## A heading\n\n- first point\n- second point\n\n```ts src/example.ts\nconst answer = 42;\n```\n\n:::note A callout\nIt works.\n:::';
const JA =
  `これは自動チェックが書いたテスト記事です。Markdown で書いた文章が、構造化された内容として保存され、すべてのルールを満たしたときだけ公開されることを確かめます。`.repeat(
    5,
  ) + '\n\n## 見出し\n\n- 一つ目\n- 二つ目\n\n{{本免許|honmenkyo|正式な運転免許}} という言葉を使います。';
const stamp = Date.now().toString(36);

console.log(`== connect and discover (mode: ${mode})`);
const tools = (await client.listTools()).tools.map((t) => t.name).sort();
ok(
  'exactly the custom tools are exposed (no generic collection tools)',
  JSON.stringify(tools) ===
    JSON.stringify([
      'check_post',
      'create_draft',
      'get_post',
      'list_posts',
      'publish_post',
      'site_guide',
      'unpublish_post',
      'update_draft',
      'upload_image',
    ]),
  tools.join(','),
);
const guide = await call('site_guide');
ok(
  'site_guide states the auto-publish state',
  guide.text.includes(mode === 'on' ? 'auto-publishing is ON' : 'auto-publishing is OFF'),
  guide.text.slice(0, 200),
);

console.log('== a draft in English');
const a = await call('create_draft', {
  language: 'en',
  title: `Agent test ${stamp}`,
  description: 'A post written by the automated agent check to prove the path.',
  slug: `zz-agent-test-${stamp}`,
  category: 'tech',
  tags: [{ slug: 'agent-test', name: 'agent test' }],
  markdown: EN,
});
ok('create_draft succeeds and says draft', a.json?.status === 'draft', a.text);
const id = a.json?.id;
const got = await call('get_post', { id });
ok(
  'get_post returns the text as Markdown with the code block and callout',
  got.json?.en?.markdown.includes('```ts src/example.ts') && got.json?.en?.markdown.includes(':::note A callout'),
  got.text.slice(0, 300),
);
ok('a draft is not visible in any language', got.json?.en?.visibleInThisLanguage === false && got.json?.status === 'draft');

console.log('== the policy gate (dry run)');
const chk = await call('check_post', { id, language: 'en' });
ok('check_post passes for a complete English post', chk.json?.problems?.length === 0, chk.text);
const jaMissing = await call('check_post', { id, language: 'ja' });
ok(
  'check_post says the Japanese side has no title or text',
  jaMissing.json?.problems?.some((p) => /no ja title/.test(p)) && jaMissing.json?.problems?.some((p) => /no ja text/.test(p)),
  jaMissing.text,
);

console.log('== refusals');
const html = await call('create_draft', {
  language: 'en',
  title: 'Has html',
  description: 'Contains raw html which must be refused.',
  slug: `zz-agent-test-html-${stamp}`,
  category: 'tech',
  markdown: 'Hello <script>alert(1)</script>',
});
ok('raw HTML in Markdown is refused', html.isError && /Raw HTML/.test(html.text), html.text);
const badLink = await call('create_draft', {
  language: 'en',
  title: 'Bad link',
  description: 'A javascript link which must be refused.',
  slug: `zz-agent-test-link-${stamp}`,
  category: 'tech',
  markdown: '[x](javascript:alert(1))',
});
ok('a javascript: link is refused', badLink.isError && /not allowed/.test(badLink.text), badLink.text);
const remote = await call('create_draft', {
  language: 'en',
  title: 'Remote image',
  description: 'A remote image which must be refused.',
  slug: `zz-agent-test-img-${stamp}`,
  category: 'tech',
  markdown: '![x](https://evil.example/a.png)',
});
ok('a remote image is refused', remote.isError && /upload_image/.test(remote.text), remote.text);
const dup = await call('create_draft', {
  language: 'en',
  title: `Agent test ${stamp}`,
  description: 'The same slug again must be refused.',
  slug: `zz-agent-test-${stamp}`,
  category: 'tech',
  markdown: EN,
});
ok('a duplicate slug is refused', dup.isError, dup.text);
const humanPost = (await call('list_posts', { limit: 50 })).json?.find((p) => !p.createdByAgent && p.status === 'published');
if (humanPost) {
  const own = await call('update_draft', { id: humanPost.id, language: 'en', title: 'Hijacked title for a human post' });
  ok("an agent cannot change a human's post", own.isError, own.text);
  const pub = await call('publish_post', { id: humanPost.id, languages: ['en'] });
  ok("an agent cannot publish over a human's post", pub.json?.results?.en?.published === false || pub.isError, pub.text);
}

console.log('== the Japanese side of the same post');
const ja = await call('update_draft', {
  id,
  language: 'ja',
  title: `エージェントのテスト ${stamp}`,
  description: '自動チェックが書いた記事で、書き方と公開の流れを確かめます。',
  markdown: JA,
});
ok('update_draft adds Japanese', ja.json?.changed?.includes('content'), ja.text);
const gotJa = await call('get_post', { id });
ok(
  'the Japanese Markdown keeps the {{term}} block',
  gotJa.json?.ja?.markdown.includes('{{本免許|honmenkyo|正式な運転免許}}'),
  gotJa.text.slice(0, 300),
);
ok('the English side is untouched', gotJa.json?.en?.title === `Agent test ${stamp}`);

console.log('== short and private text cannot be published');
const shortId = (
  await call('create_draft', {
    language: 'en',
    title: 'Too short',
    description: 'A post with almost no text to prove the minimum.',
    slug: `zz-agent-test-short-${stamp}`,
    category: 'tech',
    markdown: 'Just one line.',
  })
).json?.id;
const shortChk = await call('check_post', { id: shortId, language: 'en' });
ok(
  'too short is a problem',
  shortChk.json?.problems?.some((p) => /characters; at least/.test(p)),
  shortChk.text,
);
const privId = (
  await call('create_draft', {
    language: 'en',
    title: 'Private data',
    description: 'A post that contains an email address to prove the scan.',
    slug: `zz-agent-test-priv-${stamp}`,
    category: 'tech',
    markdown: EN + '\n\nWrite to someone.private@gmail.com or call 090-1234-5678.',
  })
).json?.id;
const privChk = await call('check_post', { id: privId, language: 'en' });
ok('an email and a phone number are privacy problems', privChk.json?.problems?.filter((p) => /^Privacy/.test(p)).length >= 2, privChk.text);

console.log(`== publishing (${mode})`);
const pubEn = await call('publish_post', { id, languages: ['en'] });
if (mode === 'off') {
  ok(
    'publishing is refused while the kill switch is off',
    pubEn.json?.results?.en?.published === false && /switched off/.test(pubEn.json.results.en.reason),
    pubEn.text,
  );
  const still = await call('get_post', { id });
  ok('the post is still a draft', still.json?.status === 'draft');
} else {
  ok('English publishes', pubEn.json?.results?.en?.published === true, pubEn.text);
  const pubJa = await call('publish_post', { id, languages: ['ja'] });
  ok('Japanese publishes', pubJa.json?.results?.ja?.published === true, pubJa.text);
  const live = await call('get_post', { id });
  ok(
    'status is published, both languages visible',
    live.json?.status === 'published' && live.json?.en?.visibleInThisLanguage && live.json?.ja?.visibleInThisLanguage,
    live.text.slice(0, 300),
  );
  const bad = await call('publish_post', { id: shortId, languages: ['en'] });
  ok(
    'a post that fails the rules is refused with the reasons',
    bad.json?.results?.en?.published === false && /characters; at least/.test(bad.json.results.en.reason),
    bad.text,
  );
  const priv = await call('publish_post', { id: privId, languages: ['en'] });
  ok(
    'a post with private data is refused',
    priv.json?.results?.en?.published === false && /Privacy/.test(priv.json.results.en.reason),
    priv.text,
  );
  // events so far: 2 (en, ja). Limit is 3 per day in this run: one more is allowed, the next is not.
  const third = await call('unpublish_post', { id });
  ok('unpublish takes the whole post offline', third.json?.live === false && third.json?.status === 'draft', third.text);
  const again = await call('publish_post', { id, languages: ['ja'] });
  ok('the third publish of the day is allowed', again.json?.results?.ja?.published === true, again.text);
  const fourth = await call('publish_post', { id, languages: ['en'] });
  ok(
    'the fourth is refused by the daily limit',
    fourth.json?.results?.en?.published === false && /Daily publish limit/.test(fourth.json.results.en.reason),
    fourth.text,
  );
}

console.log('== the key is not a general login');
const rest = await fetch(`${BASE}/api/posts?limit=1`, { headers: { Authorization: `payload-mcp-api-keys API-Key ${key}` } });
ok('the MCP key cannot read the REST API directly', rest.status === 401 || rest.status === 403, `HTTP ${rest.status}`);
const users = await fetch(`${BASE}/api/users?limit=1`, { headers: { Authorization: `payload-mcp-api-keys API-Key ${key}` } });
ok('...nor list users', users.status === 401 || users.status === 403, `HTTP ${users.status}`);

await client.close();
console.log(`\nagent checks (${mode}): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
