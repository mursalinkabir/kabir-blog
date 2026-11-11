// End-to-end check of what the agent may do beyond its own posts, over the real MCP protocol, against a local CMS.
//
//   node scripts/check-agent-scope.mjs on     the CMS was started with AGENT_AUTO_PUBLISH=1 AGENT_MAX_PUBLISHES_PER_DAY=50
//   node scripts/check-agent-scope.mjs off    the CMS was started with AGENT_AUTO_PUBLISH=0
//
// Needs the seeded fixtures (`pnpm cms:seed`) and apps/cms/.dev-credentials (ADMIN_*, AGENT_MCP_KEY). Reads results back
// with the admin account, as a person would. Creates documents whose slug starts with "zz-scope-"; re-seed to clear.
// Refuses any URL that is not localhost. Run `on` first, then `off`.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { EXPECTED_TOOLS, makeCaller } from './agent-tools.mjs';

const mode = process.argv[2];
if (!['on', 'off'].includes(mode)) throw new Error('usage: check-agent-scope.mjs on|off');
const BASE = process.env.CMS_URL ?? 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('local CMS only');
const creds = Object.fromEntries(
  readFileSync(new URL('../.dev-credentials', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 500)}` : ''}`);
  }
};

const client = new Client({ name: 'check-scope', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', BASE), {
    requestInit: { headers: { Authorization: `Bearer ${creds.AGENT_MCP_KEY}` } },
  }),
);
const call = makeCaller(client);

// ---- the admin's view, to read back what the agent did ----------------------------------------------------------
const login = await (
  await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: creds.ADMIN_EMAIL, password: creds.ADMIN_PASSWORD }),
  })
).json();
if (!login.token) throw new Error('admin login failed');
const admin = async (path, init = {}) => {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { Authorization: `JWT ${login.token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const doc = async (collection, slug, { draft = false } = {}) =>
  (await admin(`/${collection}?where[slug][equals]=${slug}&locale=all&fallback-locale=none&draft=${draft}&depth=0&limit=1`)).json.docs?.[0];
const embedsIn = (lexical) => {
  const out = [];
  const visit = (n) => {
    (n.children ?? []).forEach(visit);
    if (n.type === 'block' && n.fields?.blockType === 'html-embed') out.push(n.fields);
  };
  lexical?.root?.children?.forEach(visit);
  return out;
};

const stamp = Date.now().toString(36);
const BODY_EN =
  'This paragraph is written by the scope check to prove that a page can be drafted, checked and published by an agent. '.repeat(3);
const BODY_JA = 'この段落はスコープ確認が書いたもので、エージェントがページを下書きし、確認し、公開できることを確かめます。'.repeat(3);
const needsOn = (what, r) =>
  ok(`${what} is refused while auto-publishing is off`, r.isError && /AGENT_AUTO_PUBLISH|switched off/.test(r.text), r.text);

console.log(`== tools (mode: ${mode})`);
const tools = (await client.listTools()).tools.map((t) => t.name).sort();
ok(
  'the full tool set is exposed, and no generic collection tools',
  JSON.stringify(tools) === JSON.stringify(EXPECTED_TOOLS),
  tools.join(','),
);
ok('there is no delete tool of any kind', !tools.some((t) => /delete|remove/.test(t)), tools.join(','));

if (mode === 'on') {
  console.log("== a person's post with an embed: edit and publish it, the embed stays byte for byte");
  const human = await doc('posts', 'how-this-site-is-built', { draft: true });
  ok(
    'the seeded human post exists and has an embed',
    human && embedsIn(human.content?.en).length > 0,
    JSON.stringify(human)?.slice(0, 200),
  );
  if (human) {
    const before = embedsIn(human.content.en);
    const got = await call('get_post', { id: human.id });
    ok(
      'get_post shows it as not created by the agent, with a keep placeholder',
      got.json?.createdByAgent === false && /\[\[keep:/.test(got.json?.en?.markdown ?? ''),
      got.text,
    );
    const edited = got.json.en.markdown + `\n\nAn extra sentence added by the scope check ${stamp}.`;
    const up = await call('update_draft', { id: human.id, language: 'en', markdown: edited });
    ok('the agent can edit a post it did not create', !up.isError && up.json?.changed?.includes('content'), up.text);
    const draftNow = await doc('posts', 'how-this-site-is-built', { draft: true });
    const after = embedsIn(draftNow.content.en);
    ok('the embed is identical after the edit', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after).slice(0, 200));
    ok("the post is still not marked as the agent's", draftNow.createdByAgent === false);
    const chk = await call('check_post', { id: human.id, language: 'en' });
    ok("check_post passes a post that carries a person's embed", chk.json?.problems?.length === 0, chk.text);
    const pub = await call('publish_post', { id: human.id, languages: ['en'] });
    ok('it can be published', pub.json?.results?.en?.published === true, pub.text);
    const live = await doc('posts', 'how-this-site-is-built');
    ok(
      'the live copy has the edit and the same embed',
      JSON.stringify(live.content.en).includes(stamp) && JSON.stringify(embedsIn(live.content.en)) === JSON.stringify(before),
    );
  }
  const bogus = await call('update_draft', { id: human?.id, language: 'en', markdown: 'text\n\n[[keep:not-a-real-block]]' });
  ok('a keep placeholder for a block that is not there is refused', bogus.isError, bogus.text);

  console.log('== pages');
  const pageSlug = `zz-scope-page-${stamp}`;
  const created = await call('save_page', { language: 'en', slug: pageSlug, title: 'Scope check page', markdown: BODY_EN });
  ok('save_page creates a draft', created.json?.status === 'draft' && created.json?.id, created.text);
  const pid = created.json?.id;
  const chain1 = await call('save_page', {
    id: pid,
    language: 'en',
    title: 'Scope check page',
    expected_updated_at: created.json?.updatedAt,
  });
  ok('the updatedAt a save returns is accepted by the next edit', !chain1.isError, chain1.text);
  const chain2 = await call('save_page', {
    id: pid,
    language: 'en',
    title: 'Scope check page',
    expected_updated_at: chain1.json?.updatedAt,
  });
  ok('...and again', !chain2.isError, chain2.text);
  ok('...and it equals what get_page reports', (await call('get_page', { id: pid })).json?.updatedAt === chain2.json?.updatedAt);
  const stale = await call('save_page', { id: pid, language: 'en', title: 'Stale', expected_updated_at: '2020-01-01T00:00:00.000Z' });
  ok('an edit naming an old version is refused', stale.isError && /changed after you read it/.test(stale.text), stale.text);
  const noVersion = await call.raw('save_page', { id: pid, language: 'en', title: 'No version' });
  ok('an edit naming no version is refused', noVersion.isError && /expected_updated_at/.test(noVersion.text), noVersion.text);
  const fresh = (await call('get_page', { id: pid })).json;
  // A person edits only the English title (a language-specific field) after the agent read the page.
  const person = await admin(`/pages/${pid}?locale=en&draft=true`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Edited by a person' }),
  });
  ok('a person can edit the page meanwhile', person.status === 200, JSON.stringify(person.json).slice(0, 200));
  const lost = await call('save_page', {
    id: pid,
    language: 'ja',
    title: 'agent edit on an old read',
    expected_updated_at: fresh.updatedAt,
  });
  ok(
    "an edit based on a read from before a person's language-only change is refused",
    lost.isError && /changed after you read it/.test(lost.text),
    lost.text,
  );
  const refreshed = (await call('get_page', { id: pid })).json;
  fresh.updatedAt = refreshed.updatedAt;
  const ja = await call('save_page', {
    id: pid,
    language: 'ja',
    title: 'スコープ確認ページ',
    markdown: BODY_JA,
    expected_updated_at: fresh.updatedAt,
  });
  ok('the Japanese side is added', !ja.isError, ja.text);
  const chkPage = await call('check_page', { id: pid, language: 'ja' });
  ok('check_page passes', chkPage.json?.problems?.length === 0 && chkPage.json?.canPublish, chkPage.text);
  const pubPage = await call('publish_page', { id: pid });
  ok('publish_page publishes', pubPage.json?.published === true, pubPage.text);
  const livePage = await doc('pages', pageSlug);
  ok(
    "the page is live in both languages (with the person's title)",
    livePage?.title?.en === 'Edited by a person' && livePage?.title?.ja === 'スコープ確認ページ',
    JSON.stringify(livePage?.title),
  );
  const shortPage = await call('save_page', {
    language: 'en',
    slug: `zz-scope-short-${stamp}`,
    title: 'Too short',
    markdown: 'Far too short.',
  });
  const pubShort = await call('publish_page', { id: shortPage.json?.id });
  ok('a page that breaks the rules is refused with reasons', pubShort.isError && /at least/.test(pubShort.text), pubShort.text);
  const phonePage = await call('save_page', {
    language: 'en',
    slug: `zz-scope-phone-${stamp}`,
    title: 'Has a number',
    markdown: `${BODY_EN} Call 090-1234-5678.`,
  });
  const pubPhone = await call('publish_page', { id: phonePage.json?.id });
  ok('a page with a phone number is refused', pubPhone.isError && /Privacy/.test(pubPhone.text), pubPhone.text);
  const about = (await doc('pages', 'about', { draft: true })) ?? null;
  if (about) {
    const g = (await call('get_page', { id: about.id })).json;
    const e = await call('save_page', {
      id: about.id,
      language: 'en',
      markdown: `${g.en.markdown}\n\nChecked ${stamp}.`,
      expected_updated_at: g.updatedAt,
    });
    ok("a person's page can be edited as a draft", !e.isError, e.text);
  }
  const un = await call('unpublish_page', { id: pid });
  ok('unpublish_page takes it offline', un.json?.live === false && (await doc('pages', pageSlug))?._status === 'draft', un.text);

  console.log('== projects');
  const projSlug = `zz-scope-project-${stamp}`;
  const badLink = await call('save_project', {
    language: 'en',
    slug: `${projSlug}-bad`,
    title: 'Bad link',
    summary: 'A project with an insecure link.',
    markdown: BODY_EN,
    links: [{ label: 'Site', url: 'http://example.com' }],
  });
  ok('an http:// link is refused when saved', badLink.isError && /https/.test(badLink.text), badLink.text);
  const proj = await call('save_project', {
    language: 'en',
    slug: projSlug,
    title: 'Scope check project',
    summary: 'A project created by the scope check.',
    markdown: BODY_EN,
    state: 'idea',
    stack: ['TypeScript', 'Payload'],
    repo: 'https://github.com/example/scope',
    links: [{ label: 'Docs', url: 'https://example.com/docs' }],
    featured: false,
    order: 500,
  });
  ok('save_project creates a draft', proj.json?.status === 'draft' && proj.json?.id, proj.text);
  const got = (await call('get_project', { id: proj.json?.id })).json;
  ok(
    'get_project returns the fields',
    got?.stack?.length === 2 && got?.links?.[0]?.url === 'https://example.com/docs' && got?.order === 500,
    JSON.stringify(got)?.slice(0, 300),
  );
  const upd = await call('save_project', { id: proj.json?.id, language: 'en', state: 'active', expected_updated_at: got.updatedAt });
  ok('a project field can be changed on its own', !upd.isError, upd.text);
  const chkP = await call('check_project', { id: proj.json?.id, language: 'en' });
  ok('check_project passes', chkP.json?.problems?.length === 0, chkP.text);
  const pubP = await call('publish_project', { id: proj.json?.id });
  ok('publish_project publishes', pubP.json?.published === true, pubP.text);
  const liveP = await doc('projects', projSlug);
  ok('the project is live with its fields', liveP?.status === 'active' && liveP?.links?.length === 1, JSON.stringify(liveP)?.slice(0, 300));
  const unP = await call('unpublish_project', { id: proj.json?.id });
  ok('unpublish_project takes it offline', unP.json?.live === false, unP.text);

  console.log('== tags, categories, media');
  const tags = await call('list_tags');
  ok('list_tags lists tags in both languages', Array.isArray(tags.json) && tags.json.length > 0 && 'ja' in tags.json[0].name, tags.text);
  const tag = tags.json?.[0];
  const rn = await call('update_tag', { slug: tag.slug, language: 'ja', name: `タグ${stamp}` });
  ok('a tag can be named in Japanese', !rn.isError, rn.text);
  ok('...and the English name is untouched', (await call('list_tags')).json.find((t) => t.slug === tag.slug).name.en === tag.name.en);
  const cats = await call('list_categories');
  const cat = cats.json?.[0];
  const rc = await call('update_category_name', { slug: cat.slug, language: 'ja', name: `カテゴリ${stamp}` });
  ok('a category can be renamed in one language', !rc.isError, rc.text);
  ok(
    '...and its slug is unchanged',
    (await call('list_categories')).json.some((c) => c.slug === cat.slug),
  );
  const media = await call('list_media', { limit: 5 });
  ok('list_media lists images with alt text', media.json?.length > 0 && 'alt' in media.json[0], media.text);
  const um = await call('update_media', {
    id: media.json[0].id,
    language: 'ja',
    alt: `代替テキスト ${stamp}`,
    credit: 'Photo: Scope Check',
  });
  ok('alt text and credit can be changed', !um.isError, um.text);
  const phoneAlt = await call('update_media', { id: media.json[0].id, language: 'en', alt: 'Call 090-1234-5678 now' });
  ok('private data in alt text is refused', phoneAlt.isError && /Privacy/.test(phoneAlt.text), phoneAlt.text);

  console.log('== Now, Uses, Resume, Site (live as soon as they are saved)');
  const now = (await call('get_global', { slug: 'now' })).json;
  const upNow = await call('update_now', {
    language: 'en',
    markdown: `${now.languages.en.markdown}\n\nChecked ${stamp}.`,
    expected_version: now.version,
  });
  ok('update_now saves and goes live', upNow.json?.live === true, upNow.text);
  const staleNow = await call('update_now', { language: 'en', markdown: 'must not be saved', expected_version: now.version });
  ok(
    "a stale update_now is refused (language-only edits do not move the global's updatedAt)",
    staleNow.isError && /changed after you read it/.test(staleNow.text),
    staleNow.text,
  );
  const nowFresh = (await call('get_global', { slug: 'now' })).json;
  const nowRaw = (await admin('/globals/now?locale=en&depth=0')).json;
  const firstText = (n) => (n.type === 'text' ? n : (n.children ?? []).map(firstText).find(Boolean));
  firstText(nowRaw.content.root).text += ' (edited by a person)';
  const personNow = await admin('/globals/now?locale=en', { method: 'POST', body: JSON.stringify({ content: nowRaw.content }) });
  ok('a person can edit Now meanwhile', personNow.status === 200, JSON.stringify(personNow.json).slice(0, 200));
  const afterPerson = await call('update_now', { language: 'en', markdown: 'must not be saved', expected_version: nowFresh.version });
  ok(
    '...and so is one based on a read from before a person saved in the admin',
    afterPerson.isError && /changed after you read it/.test(afterPerson.text),
    afterPerson.text,
  );

  const uses = (await call('get_global', { slug: 'uses' })).json;
  const enGroups = uses.languages.en.groups;
  const dropOne = enGroups.slice(0, 1);
  const refused = await call('update_uses', { language: 'en', groups: dropOne, expected_version: uses.version });
  ok('dropping rows is refused without remove_missing', refused.isError && /delete/.test(refused.text), refused.text);
  const jaGroups = enGroups.map((g) => ({
    id: g.id,
    title: `日本語 ${g.title}`,
    items: g.items.map((i) => ({ id: i.id, name: `日本語 ${i.name}`, note: i.note })),
  }));
  const upUses = await call('update_uses', { language: 'ja', groups: jaGroups, expected_version: uses.version });
  ok('update_uses names the rows in Japanese', !upUses.isError, upUses.text);
  const usesAfter = (await call('get_global', { slug: 'uses' })).json;
  ok(
    'the English rows are untouched',
    JSON.stringify(usesAfter.languages.en.groups) === JSON.stringify(enGroups),
    JSON.stringify(usesAfter.languages.en.groups).slice(0, 300),
  );
  ok('the Japanese rows are saved', usesAfter.languages.ja.groups[0]?.title === jaGroups[0].title);

  const site = (await call('get_global', { slug: 'site' })).json;
  const email = site.email;
  const badHost = await call('update_site', {
    socials: [{ label: 'x', url: 'https://evil.example/me' }],
    allow_shrink: true,
    expected_version: site.version,
  });
  ok('a social link to a host that is not allowed is refused', badHost.isError && /allowed|must be https/.test(badHost.text), badHost.text);
  const httpLink = await call('update_site', {
    socials: [{ label: 'x', url: 'http://github.com/me' }],
    allow_shrink: true,
    expected_version: site.version,
  });
  ok('an http:// social link is refused', httpLink.isError, httpLink.text);
  const addSocial = await call('update_site', {
    socials: [{ label: 'github', url: 'https://github.com/example' }],
    expected_version: site.version,
  });
  ok('an allowed social link is saved', !addSocial.isError, addSocial.text);
  const shrink = await call('update_site', { socials: [], expected_version: addSocial.json?.version });
  ok('removing every social button is refused without allow_shrink', shrink.isError && /remove social/.test(shrink.text), shrink.text);
  const goodSite = await call('update_site', {
    language: 'en',
    tagline: `A tagline from the scope check ${stamp}`,
    socials: site.socials ?? [],
    allow_shrink: true,
    expected_version: addSocial.json?.version,
  });
  ok('update_site changes the tagline (and the buttons go back)', !goodSite.isError, goodSite.text);
  const siteAfter = (await call('get_global', { slug: 'site' })).json;
  ok('the contact email is unchanged', siteAfter.email === email, `${email} -> ${siteAfter.email}`);

  const resume = (await call('get_global', { slug: 'resume' })).json;
  const shrinkR = await call('update_resume', {
    work: (resume.work ?? []).slice(0, Math.max(0, (resume.work?.length ?? 0) - 1)),
    expected_version: resume.version,
  });
  ok('removing resume rows is refused without allow_shrink', (resume.work?.length ?? 0) > 0 ? shrinkR.isError : true, shrinkR.text);
  const upR = await call('update_resume', {
    basics: { summary: `Summary written by the scope check ${stamp}.` },
    expected_version: resume.version,
  });
  ok('update_resume merges basics', !upR.isError, upR.text);
  const resumeAfter = (await call('get_global', { slug: 'resume' })).json;
  ok(
    '...keeping the name and the contact email',
    resumeAfter.basics?.name === resume.basics?.name && resumeAfter.basics?.email === resume.basics?.email,
    JSON.stringify(resumeAfter.basics),
  );
  ok(
    '...and the other sections',
    (resumeAfter.work?.length ?? 0) === (resume.work?.length ?? 0) && (resumeAfter.skills?.length ?? 0) === (resume.skills?.length ?? 0),
  );
  const phoneR = await call('update_resume', { basics: { summary: 'Call me on 090-1234-5678.' }, expected_version: resumeAfter.version });
  ok('a phone number in the resume is refused', phoneR.isError && /Privacy/.test(phoneR.text), phoneR.text);

  console.log('== the audit log');
  const log = (await admin('/agent-log?limit=300&sort=-createdAt&depth=0')).json.docs ?? [];
  const publishes = log.filter((l) => l.tool === 'publish' && l.outcome === 'ok');
  for (const c of ['posts', 'pages', 'projects', 'global:now', 'global:uses', 'global:site', 'global:resume']) {
    ok(
      `a publish of ${c} is counted for the daily limit`,
      publishes.some((l) => l.collection === c),
      publishes.map((l) => l.collection).join(','),
    );
  }
  ok(
    'tool calls record the collection and the document',
    log.some((l) => l.tool === 'mcp:save_page' && l.collection === 'pages' && l.postId),
  );
  ok(
    'refusals are recorded',
    log.some((l) => l.outcome === 'refused' && /go live|rules|private|Privacy|allowed|https/i.test(`${l.summary} ${l.detail}`)) ||
      log.some((l) => l.outcome === 'error'),
  );
}

if (mode === 'off') {
  console.log('== kill switch off: drafts work, going live does not, taking down always works');
  const slug = `zz-scope-off-${stamp}`;
  const p = await call('save_page', { language: 'en', slug, title: 'Draft while off', markdown: BODY_EN });
  ok('a page draft can still be saved', p.json?.status === 'draft', p.text);
  needsOn('publish_page', await call('publish_page', { id: p.json?.id }));
  const pr = await call('save_project', {
    language: 'en',
    slug: `${slug}-p`,
    title: 'Draft project',
    summary: 'A draft while off.',
    markdown: BODY_EN,
  });
  ok('a project draft can still be saved', pr.json?.status === 'draft', pr.text);
  needsOn('publish_project', await call('publish_project', { id: pr.json?.id }));
  const now = (await call('get_global', { slug: 'now' })).json;
  const before = JSON.stringify((await call('get_global', { slug: 'now' })).json.languages.en);
  needsOn('update_now', await call('update_now', { language: 'en', markdown: 'Should not be saved.', expected_version: now.version }));
  const site = (await call('get_global', { slug: 'site' })).json;
  needsOn('update_site', await call('update_site', { language: 'en', tagline: 'Should not be saved', expected_version: site.version }));
  ok('...and nothing changed', JSON.stringify((await call('get_global', { slug: 'now' })).json.languages.en) === before);
  const tag = (await call('list_tags')).json?.[0];
  ok(
    'words around the content (tags) can still be edited',
    !(await call('update_tag', { slug: tag.slug, language: 'en', name: tag.name.en ?? tag.slug })).isError,
  );

  const about = await doc('pages', 'about');
  if (about) {
    const un = await call('unpublish_page', { id: about.id });
    ok('unpublish_page still works', un.json?.live === false, un.text);
    const back = await admin(`/pages/${about.id}?locale=en`, { method: 'PATCH', body: JSON.stringify({ _status: 'published' }) });
    ok('an admin can put it back', back.status === 200, JSON.stringify(back.json).slice(0, 200));
  }
}

console.log(`\nagent scope checks (${mode}): ${pass} passed, ${fail} failed`);
await client.close();
process.exit(fail ? 1 : 0);
