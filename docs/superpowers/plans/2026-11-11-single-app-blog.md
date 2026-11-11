# Single-App Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Payload app serves the public site itself, so a publish in the CMS or by the MCP agent is live within two seconds, with no build step.

**Architecture:** One Next.js catch-all route handler in `apps/cms` renders every public page as an HTML string from an in-memory snapshot of the content, loaded through Payload's Local API and thrown away by a hook on every change. One pod answers two hostnames: `smkabir.com` (public pages only) and `cms.smkabir.com` (admin, API, MCP and preview, behind Cloudflare Access). The Astro site, the nginx image, the content workflows and the R2 site releases are retired in the last task, after the owner confirms.

**Tech Stack:** Payload 3.90.2, Next 16.4.0, React 19.3.0 (admin only), PostgreSQL, TypeScript 6.0.3, Vitest 4.1.11, `rehype-expressive-code` 0.44.2, d2 0.9.0, pnpm 12.9.1.

**Spec:** `docs/superpowers/specs/2026-11-11-single-app-blog-design.md`. Read it before Task 0.

## Global Constraints

Every task's requirements include these. They come from the spec and from the repository's `CLAUDE.md`.

- Run pnpm as `npx --yes pnpm@12.9.1` (written `$P` below). Never `brew install` (Intel Mac; tools are release binaries in `~/.local/bin`).
- This repository never touches the cluster or homelab-terraform. Never `kubectl apply`. Deploy files here are drafts in `deploy/` for the owner to copy.
- Verify every version, config key, CLI flag and API field against current docs before use. Record new pins in `docs/versions.md`. Downloaded tools are pinned by SHA-256, GitHub Actions by commit SHA.
- Public pages carry no inline script. The page CSP never gains `unsafe-inline` for scripts. An embed frame never gets `allow-same-origin`. The embed CSP never gets `connect-src`.
- A missing localized field means no page in that locale. Never fall back to the other language.
- Published URLs are permanent: same path, same trailing slash. A moved URL needs an entry in `redirects.ts`.
- The admin, the API and preview are reachable only on the CMS hostname, behind Cloudflare Access with the JWT verified. An unknown hostname is treated as the CMS hostname.
- Colours in CSS come from tokens only (docs/design.md section 10). No raw colour in new styles.
- Privacy: no home address, phone number, personal email or family details in content, code, fixtures or tests. Run `$P privacy` before every commit.
- Schema changes ship with a committed migration. This plan needs none; if a step seems to need one, stop and report.
- No local database. Tests that need Postgres use a throwaway database in `pg-stg` (see Working environment). Never write a cluster credential into a file, Git or a transcript.
- Workloads must pass PodSecurity `restricted`: uid 10001, read-only root filesystem. Nothing writes outside `/tmp` and the existing writable mounts at run time.
- One replica. The in-memory snapshot is valid only under that assumption; say so in the deploy draft.
- Commit by explicit path after each task. Do not push, tag or open a pull request: those are the owner's steps.
- In English docs, inline Japanese terms carry Romaji in parentheses. Mark every doc snippet production-ready or illustrative.
- Do not change the design, the markup or the wording of a page. The Astro output is the reference, and the parity test (Task 9) is the judge.

## Review Focus

The five failure modes most likely to hurt a reader or the owner. Each has a test in the task that owns the code.

1. **A reader asks for a page between the publish hook and the database commit.** Payload runs `afterChange` inside the transaction, so a reload at that moment reads the old row. Expected: the change still shows within two seconds. Test in Task 4 (settle re-invalidation).
2. **One document cannot be mapped, or the database is down during a reload.** Expected: the other pages keep working and the last good site keeps being served. Tests in Task 4.
3. **Hostile path, query or content:** `//evil.com`, `<script>` in a slug, `?q=<img onerror>`, `</script>` in a title. Expected: no open redirect, escaped output, a 404 for an unknown path. Tests in Tasks 1, 2, 7 and 10.
4. **The public hostname exposes `/admin`, `/api/*` or `/preview/*`,** including through host case, a port or a trailing dot. Expected: 404 on the public host, Access check on every other host. Tests in Task 1.
5. **Unbounded work from URLs:** `/tags/x/page/999999/`, `/page/0/`, `/page/01/`, `/page/1/`, a 5,000-character search query, thousands of distinct paths. Expected: 404 for a non-canonical page number, a capped query, capped caches. Tests in Tasks 7 and 10.

## Working environment

- Shell shorthand used below: `P="npx --yes pnpm@12.9.1"`. Run everything from the repository root.
- Unit tests live in `apps/cms/tests/*.test.ts`. One file: `$P --filter @smkabir/cms exec vitest run tests/<file>`. All: `$P --filter @smkabir/cms test`. Type check: `$P --filter @smkabir/cms typecheck`.
- **d2 is not installed on this Mac.** Before Task 5, download `d2-v0.9.0-macos-amd64.tar.gz` from the d2 GitHub release, compare its SHA-256 with the release's published checksum, and put the `d2` binary in `~/.local/bin`. Record version and hash in `docs/versions.md`. Tests that need d2 skip themselves when it is missing (`it.skipIf`), so CI on a machine without it still passes.
- **Database for the dev server** (Tasks 1, 4, 7, 10, 11, 12 run the app): a throwaway database in the homelab staging Postgres, never a local one.

  ```bash
  # production-ready; the password stays in this shell only
  export KUBECONFIG=~/Dev/terraform/homelab-terraform/homelab-terraform/prod/talos/kubeconfig
  NAME=kb_test_singleapp
  kubectl -n platform exec pg-stg-1 -c postgres -- psql -U postgres -c "CREATE DATABASE $NAME"
  (while true; do kubectl -n platform port-forward svc/pg-stg-rw 25432:5432; sleep 0.5; done) &
  PW=$(kubectl -n platform get secret pg-stg-superuser -o jsonpath='{.data.password}' | base64 -d)
  export DATABASE_URL="postgres://postgres:${PW}@127.0.0.1:25432/${NAME}"
  export PAYLOAD_SECRET=$(openssl rand -hex 32)
  $P cms:migrate && $P cms:seed      # seed accepts 127.0.0.1
  $P cms:dev                         # http://localhost:3100
  ```

  When the work is done: `kubectl -n platform exec pg-stg-1 -c postgres -- psql -U postgres -c "DROP DATABASE $NAME WITH (FORCE)"` and stop the port-forward loop. Never echo `$PW` or `$DATABASE_URL`.
- **Gates.** A step marked **GATE** ends with real command output shown to the owner. Do not go past a gate that failed. A step marked **STOP** means: report and wait for the owner's answer.

## File structure

Everything new lives in `apps/cms`. `apps/site` is read, never edited, until Task 15.

```
apps/cms/
  next.config.mjs                      modify: slash handling, external packages, cache headers
  scripts/build-site-assets.mjs        new: writes public/site/{site.css,site.js,ec.css,ec.js,fonts/}
  public/theme-init.js, favicon.svg    new: copied from apps/site/public
  src/proxy.ts                         modify: host gate, slash redirect
  src/lib/accessGate.ts                modify: hostKind, 404 on the public host
  src/hooks/invalidateSite.ts          new (replaces dispatchContentPublished.ts)
  src/app/(site)/[[...path]]/route.ts  new: the public site
  src/app/preview/[[...path]]/route.ts new: draft preview, CMS host only
  src/site/
    html.ts                            escaping template tag
    canonical.ts  headers.ts  security-headers.json  redirects.ts
    i18n/{index.ts,en.json,ja.json}    copied from apps/site/src/i18n
    lib/                               copied from apps/site/src/lib without cms.ts and diagram.ts:
                                       types, media, routes, paginate, categories, jsonld, table, embeds, feed, lexical/
    data/{map.ts,load.ts,store.ts,site.ts,fixtures.ts}
    render/{rich-text.ts,code.ts,ec-options.ts,diagram.ts,blocks/*.ts}
    views/{layout.ts,header.ts,footer.ts,components/*.ts,pages/*.ts}
    router.ts  handle.ts  serve.ts  page-cache.ts  search.ts
    files/{rss.ts,sitemap.ts,robots.ts,version.ts,embed.ts}
    styles/{global.css,fonts.css}      copied from apps/site/src/styles
    client/*.js                        theme, menu, copy-link, jp-gloss, embed-frame as plain JS
```

One responsibility per file. `data/` knows Payload and nothing about HTML. `views/` and `render/` know HTML and nothing about Payload. `handle.ts` is pure (request in, response out) so every page can be tested without a server; `serve.ts` is the thin adapter from a Next `Request`.

---

### Task 0: Put the branch in order

The working tree holds about 45 uncommitted files on `feat/mcp-full-content`, 7 commits behind `origin/main`: the 0.3.0 agent work, two SEO edits, a `CLAUDE.md` update, the spec and this plan.

**Files:** no code changes.

- [ ] **Step 1: Branch and commit by explicit path, in four commits.** `git switch -c feat/single-app`. Never `git add -A`. Run `$P privacy` first.
  1. Agent work: everything under `apps/cms/`, plus `docs/agents.md`, `docs/cms.md`, `docs/cutover.md`, `docs/deploy.md`, `docs/mcp-content-plan.md`, `README.md`, `CHANGELOG.md`, `package.json`. Message: `CMS: MCP agent covers posts, pages, projects, taxonomy and settings (0.3.0 work)`.
  2. `apps/site/src/layouts/BaseLayout.astro` and `apps/site/src/pages/[...locale]/posts/[slug].astro`. Message: `Site: og:image and twitter:image for posts`.
  3. `CLAUDE.md`. Message: `CLAUDE.md: commands and architecture`.
  4. `docs/superpowers/`. Message: `docs: single-app design and plan`.
- [ ] **Step 2: Rebase.** `git fetch origin && git rebase origin/main`. If `CLAUDE.md` conflicts on the "Images:" line, keep `origin/main`'s line (it lists the wider set of public image sources) and keep this branch's other additions. Any other conflict: **STOP**.
- [ ] **Step 3: GATE.** `$P install --frozen-lockfile && $P test && $P --filter @smkabir/cms typecheck && $P check`. Expected: all pass; `ls apps/site/src/content/fixtures/posts | wc -l` prints 12 or more. Show the output.

---

### Task 1: Walking skeleton (host gate, slash rule, one page, headers)

Proves the three unverified Next behaviours before anything is built on them.

**Files:**
- Modify: `apps/cms/src/lib/accessGate.ts`, `apps/cms/src/proxy.ts`, `apps/cms/next.config.mjs`
- Create: `apps/cms/src/site/canonical.ts`, `apps/cms/src/site/headers.ts`, `apps/cms/src/site/security-headers.json`, `apps/cms/src/app/(site)/[[...path]]/route.ts`
- Test: `apps/cms/tests/accessGate.test.ts`, `apps/cms/tests/canonical.test.ts`, `apps/cms/tests/siteHeaders.test.ts`

**Interfaces:**
- Produces:
  - `hostKind(host: string | null, env: Record<string, string | undefined>): 'public' | 'cms'`
  - `GateInput` gains `host: string | null`; `GateDecision` deny status becomes `401 | 403 | 404 | 503`
  - `slashRedirect(pathname: string): string | null`
  - `pageHeaders(opts?: { preview?: boolean }): Record<string, string>`, `embedHeaders(): Record<string, string>`

- [ ] **Step 1: Write the failing gate tests** in `tests/accessGate.test.ts`.

```ts
const prod = { NODE_ENV: 'production', SITE_PUBLIC_HOSTS: 'smkabir.com' };
const d = (host: string | null, pathname: string, env = prod) => decide({ host, pathname, assertion: null, env });

it.each(['smkabir.com', 'SMKABIR.COM', 'smkabir.com:443', 'smkabir.com.'])('%s is public', (h) =>
  expect(hostKind(h, prod)).toBe('public'));
it.each([null, '', 'cms.smkabir.com', 'evil.com', 'smkabir.com.evil.com', '10.0.0.5'])('%s is cms', (h) =>
  expect(hostKind(h, prod)).toBe('cms'));
it('defaults to smkabir.com when SITE_PUBLIC_HOSTS is unset', () =>
  expect(hostKind('smkabir.com', { NODE_ENV: 'production' })).toBe('public'));

it('public host serves pages without an Access assertion', async () =>
  expect(await d('smkabir.com', '/posts/x/')).toEqual({ action: 'pass' }));
it.each(['/admin', '/admin/', '/ADMIN/login', '/api/mcp', '/Api/posts', '/preview/posts/x/'])(
  'public host answers 404 for %s', async (p) =>
    expect(await d('smkabir.com', p)).toMatchObject({ action: 'deny', status: 404 }));
it.each(['/administrator/', '/apiary/', '/previews/'])('%s is an ordinary page path', async (p) =>
  expect(await d('smkabir.com', p)).toEqual({ action: 'pass' }));
it.each(['cms.smkabir.com', 'unknown.example', null])('host %s needs Access for every path', async (h) => {
  expect(await d(h, '/')).toMatchObject({ action: 'deny' });
  expect(await d(h, '/admin')).toMatchObject({ action: 'deny' });
});
it('health and ready answer on any host', async () => {
  expect(await d('smkabir.com', '/healthz')).toEqual({ action: 'health' });
  expect(await d(null, '/readyz')).toEqual({ action: 'pass' });
});
it('outside production everything passes', async () =>
  expect(await d('smkabir.com', '/admin', { NODE_ENV: 'development' })).toEqual({ action: 'pass' }));
```

- [ ] **Step 2: Run** `$P --filter @smkabir/cms exec vitest run tests/accessGate.test.ts`. Expected: FAIL, `hostKind` is not exported.
- [ ] **Step 3: Implement in `accessGate.ts`.** Order inside `decide`: health, ready, non-production pass, then `hostKind`. Public host: deny 404 when the lower-cased path equals or starts with `/admin`, `/api` or `/preview` at a segment boundary; otherwise pass. Any other host: the existing Access check. `hostKind` lower-cases, strips one trailing dot and a `:port`, and compares with the comma list in `SITE_PUBLIC_HOSTS` (default `smkabir.com`).
- [ ] **Step 4: Write the failing slash tests** in `tests/canonical.test.ts`.

```ts
it.each([['/posts/x', '/posts/x/'], ['/ja', '/ja/'], ['/tags/a/page/2', '/tags/a/page/2/']])(
  '%s redirects to %s', (from, to) => expect(slashRedirect(from)).toBe(to));
it.each(['/', '/posts/x/', '/rss.xml', '/embeds/abc.html', '/site/site.css', '/api/mcp', '/API/posts',
  '/admin', '/admin/collections/posts', '/_next/static/x', '/healthz', '/readyz', '/preview',
  '//evil.com', '/\\evil.com', '/posts//x'])('%s is left alone', (p) => expect(slashRedirect(p)).toBeNull());
```

- [ ] **Step 5: Implement `slashRedirect`.** Null when the path ends in `/`, has a dot in its last segment, contains `//` or `\`, or starts with `/api`, `/admin`, `/_next`, `/preview`, `/healthz`, `/readyz` (case-insensitive, segment boundary). Otherwise the path plus `/`.
- [ ] **Step 6: Headers.** Copy `apps/site/security-headers.json` to `apps/cms/src/site/security-headers.json` and remove `'wasm-unsafe-eval'` from the page CSP (it existed only for Pagefind). Test in `tests/siteHeaders.test.ts`:

```ts
const csp = pageHeaders()['Content-Security-Policy'];
expect(csp).toContain("script-src 'self'");
expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
expect(csp).not.toContain('wasm-unsafe-eval');
expect(pageHeaders()['Cache-Control']).toBe('public, max-age=0, must-revalidate');
const pv = pageHeaders({ preview: true });
expect(pv['Cache-Control']).toBe('private, no-store');
expect(pv['X-Robots-Tag']).toBe('noindex');
expect(pv['Content-Security-Policy']).toContain("frame-ancestors 'self'");
expect(embedHeaders()['Content-Security-Policy']).not.toContain('connect-src');
```

  `pageHeaders` returns every header the JSON's page set lists, plus `Cache-Control`. One addition to the copied policy: in production the media files live on R2 under `MEDIA_PUBLIC_URL` (see `payload.config.ts`), a different origin from the pages, so `pageHeaders` appends the origin of `MEDIA_PUBLIC_URL` to `img-src` when that variable holds a valid `https:` URL, and nothing otherwise. Test: with `MEDIA_PUBLIC_URL=https://media.example/x` the `img-src` directive contains `https://media.example` and `script-src` is unchanged; with `MEDIA_PUBLIC_URL=javascript:1` or `"; script-src *"` the policy equals the one with the variable unset.
- [ ] **Step 7: Proxy and config.** In `proxy.ts`: pass `host: request.headers.get('host')` (ignore `X-Forwarded-Host`); a 404 denial answers `Not found` with status 404; for GET and HEAD, when `slashRedirect(pathname)` is not null, answer 308 to that path plus the original query string. In `next.config.mjs` add `skipTrailingSlashRedirect: true` (not `trailingSlash: true`, which would redirect the agent's `POST /api/mcp`) and `serverExternalPackages: ['rehype-expressive-code', 'expressive-code', 'shiki']`. Check both key names in the Next 16.4 docs first.
- [ ] **Step 8: Skeleton route.** `src/app/(site)/[[...path]]/route.ts` exports `dynamic = 'force-dynamic'` and a `GET` that returns `<!doctype html><title>ok</title><p>path: …` with `pageHeaders()`, the path taken from `params.path` (escaped).
- [ ] **Step 9: GATE, with the dev server running** (`NODE_ENV` is development, so the gate is open; this checks routing):

```bash
curl -sI localhost:3100/posts/x      | head -3   # 308, location: /posts/x/
curl -sI 'localhost:3100/posts/x?a=1' | grep -i location   # /posts/x/?a=1
curl -s  localhost:3100/posts/x/     | head -1   # path: posts/x
curl -s  localhost:3100/             | head -1   # path: (empty)
curl -sI localhost:3100/admin        | head -1   # 200 (the admin still renders)
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3100/api/mcp   # not 308
curl -sI localhost:3100/posts/x/ | grep -i content-security-policy
```

  If `/posts/x/` (with the slash) does not reach the handler, apply the fallback: in the proxy, `NextResponse.rewrite` a slash-terminated page path to the same path without the slash, and keep the handler treating the slash form as canonical. Rerun the gate. If neither works: **STOP**.
- [ ] **Step 10: Production-mode gate.** `$P --filter @smkabir/cms build`, then start with `NODE_ENV=production PORT=3100 node apps/cms/.next/standalone/apps/cms/server.js` and show:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: smkabir.com'     localhost:3100/          # 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: smkabir.com'     localhost:3100/admin     # 404
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: SMKABIR.COM.'    localhost:3100/api/posts # 404
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: cms.smkabir.com' localhost:3100/          # 401, 403 or 503
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: other.example'   localhost:3100/admin     # 401, 403 or 503
```

- [ ] **Step 11: Commit** the files listed above. Message: `CMS: public-host gate, trailing-slash rule and site route skeleton`.

---

### Task 2: The `html` template tag

Every page is built with this. Its one job is that nothing reaches the output unescaped by accident.

**Files:**
- Create: `apps/cms/src/site/html.ts`
- Test: `apps/cms/tests/html.test.ts`

**Interfaces:**
- Produces:
  - `type Html = { readonly __html: string }`
  - `html(strings: TemplateStringsArray, ...values: unknown[]): Html` (tagged template)
  - `raw(s: string): Html`, `render(h: Html): string`
  - `join(items: readonly Html[], sep?: string): Html`
  - `attr(name: string, value: string | number | boolean | null | undefined): Html` (`false`, `null`, `undefined` give nothing; `true` gives the bare name; otherwise ` name="escaped"` with a leading space)

- [ ] **Step 1: Write the failing tests.**

```ts
const s = (h: Html) => render(h);
expect(s(html`<p>${'<script>alert(1)</script>'}</p>`)).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
expect(s(html`<a href="${'"><img src=x onerror=1>'}">x</a>`)).not.toContain('"><img');
expect(s(html`${"it's & <b>"}`)).toBe('it&#39;s &amp; &lt;b&gt;');
expect(s(html`${null}${undefined}${false}${0}`)).toBe('0');
expect(s(html`<ul>${[html`<li>a</li>`, html`<li>${'<'}</li>`]}</ul>`)).toBe('<ul><li>a</li><li>&lt;</li></ul>');
expect(s(html`${raw('<hr>')}`)).toBe('<hr>');
expect(s(html`${JSON.parse('{"__html":"<b>"}')}`)).not.toContain('<b>');    // a look-alike from JSON is never trusted
expect(s(html`<a${attr('href', '/x?a=1&b=2')}${attr('hidden', true)}${attr('title', null)}>`)).toBe('<a href="/x?a=1&amp;b=2" hidden>');
expect(s(join([html`a`, html`b`], ', '))).toBe('a, b');
```

  `Html` objects are recognised by a module-private `WeakSet` (or a private class), never by the shape of the object, so content loaded from the database can never pass as trusted markup.
- [ ] **Step 2: Run** `vitest run tests/html.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Escape `& < > " '`. Numbers are stringified. Arrays are flattened, each item treated by the same rule. Any other object is escaped through `String(value)`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `CMS site: escaping html template tag`.

---

### Task 3: Pure library, the `Site` view and the fixture loader

Port the Astro site's data layer so the same questions give the same answers, with no Astro and no module-level state.

**Files:**
- Create: `apps/cms/src/site/i18n/{index.ts,en.json,ja.json}` (copy from `apps/site/src/i18n/`; replace `import.meta.env` uses, if any, with plain constants)
- Create: `apps/cms/src/site/lib/` as a copy of `apps/site/src/lib/` without `cms.ts` and `diagram.ts` (so: `types, media, routes, paginate, categories, jsonld, table, embeds, feed` and the `lexical/` folder; change `~/` imports to relative ones; `inline.ts` keeps returning escaped strings and is wrapped with `raw()` by its callers in Task 5)
- Create: `apps/cms/src/site/data/site.ts`, `apps/cms/src/site/data/fixtures.ts`
- Test: `apps/cms/tests/siteData.test.ts`, plus `paginate.test.ts`, `lexical.test.ts`, `embeds.test.ts` copied from `apps/site/tests/` with imports adjusted

**Interfaces:**
- Produces (`data/site.ts`):

```ts
export interface SiteData {
  posts: Post[]; projects: Project[]; pages: Page[];
  site: SiteGlobal; now: NowGlobal; uses: UsesGlobal; resume: ResumeGlobal;
}
export interface SiteOptions { source: 'cms' | 'fixtures'; version: string; preview?: boolean }
export function createSite(data: SiteData, opts: SiteOptions): Site;
export function pick<T>(value: Localized<T> | undefined, locale: Locale): T | undefined;
export function hasPage(post: Post, locale: Locale, preview?: boolean): boolean;
export function categoryRoute(slug: Category['slug']): CategoryRoute;       // 'japan-life' -> 'japan'
export function categoryByRoute(route: string): Category['slug'] | undefined;
```

  `Site` has: `source`, `version`, `preview`, `getSite()`, `getNow()`, `getResume()`, `siteName(locale)`, `getPosts(locale): PostView[]`, `getProjects(locale): ProjectView[]`, `getPage(slug, locale)`, `getAllPages(locale)`, `getUsedTags(locale)`, `getRelated(post, locale, count = 2)`, `getUsesGroups(locale)`, `sectionLocales(section)`, `navPageExists(key, locale)`, `embeds(): Map<string, string>` (embed id to author HTML, from every html-embed block in every visible document), `pageBlockers(post: Post, locale: Locale): string[]`.
- Produces (`data/fixtures.ts`): `loadFixtureData(dir?: string): SiteData`. Default `dir` is `apps/site/src/content/fixtures` resolved from the repository root. The fixture JSON is already in the mapped shape. Used by tests and the parity run only, never by the server.

- [ ] **Step 1: Port the pure library files and their three tests.** Run them. Expected: PASS with no change to the assertions. If an assertion has to change, **STOP**.
- [ ] **Step 2: Write the failing `siteData.test.ts`.** Start from `apps/site/tests/content.test.ts` (locale rule, `pick()` never falls back, media URLs) with `const site = createSite(loadFixtureData(), { source: 'fixtures', version: 't' })`. Add:

```ts
it('lists a post only in the locales where it is complete', () => {
  const data = loadFixtureData();
  const p = data.posts[0]; p.title = { en: p.title.en };            // no Japanese title
  const s = createSite(data, { source: 'fixtures', version: 't' });
  expect(s.getPosts('en').some((x) => x.slug === p.slug)).toBe(true);
  expect(s.getPosts('ja').some((x) => x.slug === p.slug)).toBe(false);
  expect(s.pageBlockers(p, 'ja')).toContain('title');
  expect(s.pageBlockers(p, 'en')).toEqual([]);
});
it('does not throw on a site with no posts', () => {
  const s = createSite({ ...loadFixtureData(), posts: [] }, { source: 'cms', version: 't' });
  expect(s.getPosts('en')).toEqual([]);
});
it('preview shows drafts but still needs the locale to be complete', () => {
  const data = loadFixtureData(); data.posts[0]._status = 'draft';
  expect(createSite(data, { source: 'cms', version: 't' }).getPosts('en')).toHaveLength(data.posts.length - 1);
  expect(createSite(data, { source: 'cms', version: 't', preview: true }).getPosts('en')).toHaveLength(data.posts.length);
});
it('sorts posts newest first and is stable across calls', () => { /* pubDate descending; same array identity on a second call */ });
```

  `pageBlockers` returns the names of what is missing, from this fixed set: `status`, `publishedIn`, `title`, `description`, `content`, `heroAlt`, `category`. An empty array means the page exists.
- [ ] **Step 3: Implement `createSite`** as a port of `apps/site/src/lib/cms.ts`. Differences from the original, all deliberate: data comes in as an argument (no `import.meta.glob`); memoisation lives in the closure; zero posts is not an error; a category with no name in a locale makes that post absent from the locale (blocker `category`) where the original threw; `preview` skips only the `_status` check.
- [ ] **Step 4: Run** the four test files. Expected: PASS.
- [ ] **Step 5: Commit.** `CMS site: data library, Site view and fixture loader`.

---

### Task 4: Mapper, loader, snapshot store and invalidation hooks

Turns Payload documents into `SiteData`, keeps one snapshot in memory, and throws it away when anything changes.

**Files:**
- Create: `apps/cms/src/site/data/map.ts`, `data/load.ts`, `data/store.ts`, `apps/cms/src/hooks/invalidateSite.ts`
- Modify: `apps/cms/src/collections/{Posts,Pages,Projects,Tags,Categories,Media}.ts`, `apps/cms/src/globals/index.ts`
- Delete: `apps/cms/src/hooks/dispatchContentPublished.ts`, `apps/cms/tests/dispatch.test.ts`
- Test: `apps/cms/tests/siteMap.test.ts` (with `tests/fixtures/payload-raw.json` copied from `apps/site/tests/fixtures/`), `apps/cms/tests/siteStore.test.ts`

**Interfaces:**
- Consumes: `SiteData`, `createSite`, `Site` (Task 3).
- Produces:

```ts
// data/load.ts
export interface RawContent {
  media: unknown[]; categories: unknown[]; tags: unknown[]; posts: unknown[]; projects: unknown[]; pages: unknown[];
  globals: { site: unknown; now: unknown; uses: unknown; resume: unknown };
}
export function loadRaw(payload: Payload, opts: { draft: boolean }): Promise<RawContent>;
// data/map.ts
export function mapAll(raw: RawContent): { data: SiteData; errors: string[] };
// data/store.ts
export interface SnapshotStore {
  get(): Promise<Site>;
  invalidate(): void;
  status(): { version: string | null; loadedAt: string | null; stale: boolean; errors: number };
}
export function createSnapshotStore(opts: {
  load: () => Promise<RawContent>; now?: () => number; log?: (msg: string) => void;
  ttlMs?: number;      // default 60_000
  settleMs?: number;   // default 2_000
  preview?: boolean;
}): SnapshotStore;
export function siteStore(): SnapshotStore;   // process-wide, kept on globalThis so dev hot reload does not duplicate it
// hooks/invalidateSite.ts
export const invalidateAfterChange: CollectionAfterChangeHook;
export const invalidateAfterDelete: CollectionAfterDeleteHook;
export const invalidateAfterGlobalChange: GlobalAfterChangeHook;
```

- [ ] **Step 1: Write the failing mapper tests.** Port `apps/site/tests/cms-map.test.ts` (`localized()`, `isEmptyLexical()`, `mapMedia()`, `mapAll()` on `payload-raw.json`). Change the "errors that must stop a build" group to the new rule and add:

```ts
it('skips one bad document and keeps the rest', () => {
  const raw = structuredClone(RAW); (raw.posts[0] as any).category = 999999;      // unknown category id
  const { data, errors } = mapAll(raw);
  expect(data.posts).toHaveLength(RAW.posts.length - 1);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatch(/^posts\/\S+: /);
});
it('keeps the first of two posts with the same slug and reports the second', () => { /* errors[0] matches /duplicate slug/ */ });
it('takes media URLs from Payload, not from the filename', () => {
  const raw = structuredClone(RAW);
  (raw.media[0] as any).url = 'https://media.example/a.webp';
  (raw.media[0] as any).sizes = { w480: { url: 'https://media.example/a-480.webp', width: 480, height: 320 } };
  const m = mapAll(raw).data.posts.find((p) => p.hero)!.hero!;   // pick a post whose hero is media[0]
  expect(m.sizes!['480'].url).toBe('https://media.example/a-480.webp');
});
it('a global that fails to map is an error and leaves a safe empty value', () => { /* errors has 'globals/now: …'; data.now is defined */ });
```

- [ ] **Step 2: Implement `map.ts`** as a TypeScript port of `apps/site/scripts/lib/cms-map.mjs`, returning `SiteData` directly (no `files`, no `downloads`). Each document is mapped inside its own `try`; a failure pushes `"<collection>/<slug or id>: <message>"` and skips the document. Media: without R2 (local dev) Payload's URLs start with `/api/media/file/`, which the public hostname hides (Task 1), so they work in dev only. Production stores media on R2 and Payload returns `MEDIA_PUBLIC_URL/...`. When `NODE_ENV` is `production` and a mapped media URL starts with `/api/`, add one error line (`media/<id>: URL is not public`) so `/version.json` shows a non-zero error count; do not skip the document.
- [ ] **Step 3: Implement `load.ts`.** One `payload.find` per collection with `locale: 'all', fallbackLocale: false, depth: 0, pagination: false, draft, overrideAccess: true, sort: 'id'`, and one `findGlobal` per global with the same locale options. Verify the option names against the Payload 3.90 Local API docs.
- [ ] **Step 4: Write the failing store tests** with a fake `load` and a fake clock (`vi.useFakeTimers()`).

```ts
it('loads once for concurrent first requests', async () => {
  const load = vi.fn(async () => RAW); const store = createSnapshotStore({ load });
  const [a, b] = await Promise.all([store.get(), store.get()]);
  expect(load).toHaveBeenCalledTimes(1); expect(a).toBe(b);
});
it('reloads after invalidate, and once more after the settle delay', async () => {     // Review Focus 1
  let n = 0; const load = vi.fn(async () => (n++ === 0 ? RAW : RAW_WITH_NEW_POST));
  const store = createSnapshotStore({ load, settleMs: 2000 });
  await store.get();
  load.mockImplementationOnce(async () => RAW);                     // the hook fired before the commit: old rows
  store.invalidate();
  expect((await store.get()).getPosts('en')).toHaveLength(OLD_COUNT);
  await vi.advanceTimersByTimeAsync(2000);
  expect((await store.get()).getPosts('en')).toHaveLength(OLD_COUNT + 1);
});
it('keeps the same version when the content did not change', async () => { /* two loads of RAW: version equal */ });
it('changes the version when one field changes', async () => { /* versions differ; version matches /^[0-9a-f]{16}$/ */ });
it('serves the last good snapshot when a reload fails', async () => {                 // Review Focus 2
  const load = vi.fn().mockResolvedValueOnce(RAW).mockRejectedValue(new Error('db down'));
  const store = createSnapshotStore({ load }); const first = await store.get();
  store.invalidate();
  expect(await store.get()).toBe(first);
  expect(store.status().stale).toBe(true);
});
it('rejects when the very first load fails, and retries on the next get', async () => { /* reject, then resolve */ });
it('refreshes in the background after ttlMs without making the caller wait', async () => { /* get() returns the old Site at once; a later get() returns the new one */ });
it('many invalidations in a burst cause at most two loads', async () => { /* 50 × invalidate(); one get(); advance settleMs; one get() */ });
```

- [ ] **Step 5: Implement `store.ts`.** `version` is the first 16 hex characters of the SHA-256 of `JSON.stringify(raw)`. An invalidation sets a dirty flag and (re)arms one settle timer that sets the flag again; `get()` reloads when dirty. Mapper errors are logged once per version and counted in `status().errors`. `siteStore()` builds the store with `load: async () => loadRaw(await getPayload({ config }), { draft: false })`.
- [ ] **Step 6: Hooks.** Each hook calls `siteStore().invalidate()` and returns the document unchanged; it never awaits a reload and never throws. Add them to Posts, Pages, Projects, Tags, Categories and Media (`afterChange`, `afterDelete`) and to the four globals. Remove `dispatchAfterPublish`, `dispatchAfterChange`, `dispatchAfterGlobalChange` everywhere, delete the dispatch hook file and its test, and remove `GITHUB_DISPATCH_TOKEN` from `apps/cms/.env.example` (`grep -rni "dispatch" apps/cms --exclude-dir=node_modules --exclude-dir=.next` must come back empty). The deploy drafts and docs that mention it are cleaned in Task 14.
- [ ] **Step 7: Run** `$P --filter @smkabir/cms test && $P --filter @smkabir/cms typecheck`. Expected: PASS.
- [ ] **Step 8: GATE (real database).** With the dev server on the `pg-stg` database, temporarily make the skeleton route print `(await siteStore().get()).getPosts('en').length` and the version. Show: the count equals the number of seeded posts; after changing a post title in the admin and saving, the version changes within two seconds (`curl` in a loop). Remove the temporary print.
- [ ] **Step 9: Commit.** `CMS site: content snapshot with hook invalidation; content dispatch removed`.

---

### Task 5: Rich text, blocks, code and diagrams

**Files:**
- Create: `apps/cms/src/site/render/rich-text.ts`, `render/code.ts`, `render/ec-options.ts`, `render/diagram.ts`, `render/blocks/{code,terminal,callout,figure,gallery-strip,diagram,html-embed,media-image,table}.ts`
- Modify: `apps/cms/package.json` (add `rehype-expressive-code@0.44.2`, exact version), `apps/cms/src/blocks/index.ts` (export `BLOCK_SLUGS` and `INLINE_BLOCK_SLUGS`, built from the block objects' own `slug` fields)
- Test: `apps/cms/tests/richText.test.ts`, `apps/cms/tests/renderCode.test.ts`, `apps/cms/tests/diagram.test.ts`

**Interfaces:**
- Consumes: `html`, `raw`, `Html` (Task 2); lexical helpers, `embeds`, `media`, `table` (Task 3).
- Produces:

```ts
export interface RenderCtx { locale: Locale }
export function renderRichText(doc: LexicalDoc | undefined, ctx: RenderCtx): Promise<Html>;
export function renderCode(input: { code: string; language?: string; title?: string; mark?: string; frame?: 'code' | 'terminal' }): Promise<Html>;
export function codeAssets(): Promise<{ css: string; js: string }>;      // baseStyles + themeStyles, jsModules joined
export function renderDiagram(input: { engine: 'd2' | 'mermaid'; source: string; alt: string }): Promise<Html>;
export const BLOCK_RENDERERS: Record<string, (fields: any, ctx: RenderCtx) => Promise<Html> | Html>;
export function mediaImage(media: Media, locale: Locale, opts?: { loading?: 'lazy' | 'eager'; sizes?: string }): Html;
```

- [ ] **Step 1: Write the failing rich-text tests.** The reference for every expectation is `apps/site/src/components/Node.astro`, `RichText.astro` and `components/blocks/*.astro`.

```ts
const r = async (children: unknown[]) => render(await renderRichText({ root: { children } } as any, { locale: 'en' }));
it('escapes text', async () => expect(await r([P('<script>x</script>')])).toContain('&lt;script&gt;'));
it('renders h2-h4 with an id and an anchor', async () =>
  expect(await r([H('h2', 'Setup')])).toBe('<h2 id="setup">Setup<a class="anchor" href="#setup" aria-hidden="true" tabindex="-1">#</a></h2>'));
it('renders a checklist with hidden done/todo labels', async () => { /* class="checklist", .check-mark, visually hidden a11y.done */ });
it('throws on an unknown node type', async () => await expect(r([{ type: 'marquee' }])).rejects.toThrow(/marquee/));
it('throws on an unknown block', async () => await expect(r([{ type: 'block', fields: { blockType: 'nope' } }])).rejects.toThrow(/nope/));
it('has a renderer for every block the CMS defines', async () => {
  const { BLOCK_SLUGS, INLINE_BLOCK_SLUGS } = await import('../src/blocks');
  expect(Object.keys(BLOCK_RENDERERS).sort()).toEqual([...BLOCK_SLUGS].sort());   // code, terminal, callout, figure, gallery-strip, diagram, html-embed
  expect(INLINE_BLOCK_SLUGS).toEqual(['jp']);                                      // rendered by lib/lexical/inline.ts
});
it('renders the jp inline block as the Astro site does', async () => { /* same markup as inline.ts gives in apps/site/tests/lexical.test.ts */ });
it('frames an html-embed with sandbox="allow-scripts" and nothing more', async () => {
  const out = await r([BLOCK('html-embed', { html: '<script>1</script>' })]);
  expect(out).toMatch(/<iframe[^>]+src="\/embeds\/[0-9a-f]+\.html"/);
  expect(out).toMatch(/sandbox="allow-scripts"/);
  expect(out).not.toContain('allow-same-origin');
  expect(out).not.toContain('<script>1</script>');
});
```

  A thrown rich-text error is caught by the page handler in Task 7 (that one page answers 500 and logs; other pages are unaffected). It is not caught here.
- [ ] **Step 2: Implement `rich-text.ts` and the block files.** One function per Astro block component, same markup, same class names, same attribute order where the parity test will compare them. `inlineToHtml` output is wrapped with `raw()` (it escapes its own text; confirm that by reading it and its test before trusting it).
- [ ] **Step 3: Code blocks: failing tests, then implementation.**

```ts
it('highlights and marks lines', async () => {
  const out = render(await renderCode({ code: 'const a = 1;\nconst b = 2;', language: 'ts', mark: '2' }));
  expect(out).toContain('class="expressive-code"');
  expect(out).toMatch(/class="[^"]*\bmark\b/);
  expect(out).not.toContain('<style');           // styles ship once in /site/ec.css, never inline
  expect(out).not.toContain('<script');
});
it('escapes code', async () => expect(render(await renderCode({ code: '</pre><script>x</script>' }))).not.toContain('<script>x'));
it('falls back to plain text for an unknown language', async () => { /* no throw; contains the escaped code */ });
it('returns the same object for the same input', async () => { /* cache hit: toBe */ });
it('terminal frame', async () => { /* frame: 'terminal' output contains 'is-terminal' */ });
```

  `code.ts` calls `createRenderer(options)` from `rehype-expressive-code` once (a module-level promise), with options moved from `apps/site/ec.config.mjs` into `render/ec-options.ts`. Per block: `ec.render({ code, language, meta, props })`, then `toHtml(renderedGroupAst)` from `rehype-expressive-code/hast`. `mark: "4,6-8"` becomes the meta string `{4,6-8}` exactly as `CodeBlock.astro` does. Per-block `styles` returned by `render` are dropped; check in the first test run that the output looks right without them, and if a block needs them, add them to `codeAssets().css` (stylesheet, not inline). Cache by SHA-256 of the input, capped at 500 entries (delete the oldest on overflow).
- [ ] **Step 4: Diagrams: failing tests, then implementation.**

```ts
it.skipIf(!hasD2)('renders d2 to inline svg', async () =>
  expect(render(await renderDiagram({ engine: 'd2', source: 'a -> b', alt: 'A to B' }))).toMatch(/<svg[\s\S]+<\/svg>/));
it('shows the source when d2 is missing or fails', async () => {
  const out = render(await renderDiagram({ engine: 'd2', source: 'a -> -> <b>', alt: 'x' }));   // PATH emptied for this test
  expect(out).toContain('<pre'); expect(out).toContain('&lt;b&gt;');
});
it('shows mermaid as source', async () => { /* <pre>, escaped */ });
```

  `diagram.ts` runs `execFile('d2', ['--theme', '0', '--pad', '16', '-', '-'])` (async, source on stdin, 10-second timeout, 2 MB output cap), same flags as `apps/site/src/lib/diagram.ts`. The SVG is post-processed the same way the Astro version does it. Cache by source hash, capped at 200. A failure is cached for 60 seconds so a broken diagram does not start d2 on every request.
- [ ] **Step 5: Run** the three test files and `typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.** `CMS site: rich text, blocks, code highlighting and diagrams`.

---

### Task 6: Layout, header, footer, components and static assets

**Files:**
- Create: `apps/cms/src/site/views/layout.ts`, `views/header.ts`, `views/footer.ts`
- Create: `apps/cms/src/site/views/components/{avatar,category-icon,cover,pagination,post-card,post-meta,posts-page,project-cards,share-links,social-icon,toc}.ts` (one per file in `apps/site/src/components/`, apart from `Node`, `RichText` and `blocks/`, which Task 5 covered)
- Create: `apps/cms/src/site/styles/{global.css,fonts.css}`, `apps/cms/src/site/client/{theme,menu,copy-link,jp-gloss,embed-frame}.js`, `apps/cms/scripts/build-site-assets.mjs`, `apps/cms/public/{theme-init.js,favicon.svg}`
- Modify: `apps/cms/package.json` (add `"version": "0.3.0"`, which the file lacks today; scripts `predev`, `prebuild`; dependencies `@fontsource-variable/mulish`, `@fontsource-variable/jetbrains-mono` at the versions `apps/site` pins), `apps/cms/next.config.mjs` (`headers()`), `.gitignore` (`apps/cms/public/site/`)
- Test: `apps/cms/tests/layout.test.ts`, `apps/cms/tests/siteAssets.test.ts`

**Interfaces:**
- Consumes: `html`, `Html`, `attr`, `raw` (Task 2); `Site`, `PostView` (Task 3); `mediaImage` (Task 5).
- Produces:

```ts
export interface LayoutProps {
  site: Site; locale: Locale; path: string;          // localized path, e.g. /ja/posts/x/
  title: string; description: string;
  alternates?: Alternates; type?: 'website' | 'article'; structuredData?: object[]; noindex?: boolean;
  image?: string; publishedTime?: string; modifiedTime?: string; rss?: { href: string; title: string }[];
  usesCode?: boolean;                                 // adds /site/ec.css and /site/ec.js
  banner?: Html;                                      // preview banner (Task 11)
}
export function layout(props: LayoutProps, body: Html): Html;       // the whole document, from <!doctype html>
export const ASSET_VERSION: string;                                  // apps/cms package.json "version"
export function asset(path: string): string;                         // '/site/site.css' -> '/site/site.css?v=0.3.0'
```

  Each component file exports one function named after the file in camel case (`postCard(post, locale, opts): Html`), taking the props of the Astro component it ports.

- [ ] **Step 1: Write the failing layout tests** on fixture data. The reference is `apps/site/src/layouts/BaseLayout.astro`, tag for tag and in the same order.

```ts
const doc = (over = {}) => render(layout({ site, locale: 'en', path: '/posts/x/', title: 'T', description: 'D', ...over }, html`<p>body</p>`));
it('starts with the doctype and sets lang', () => expect(doc()).toMatch(/^<!doctype html>\s*<html lang="en">/));
it('title: "T · <site name>", and only the site name on a home page', () => { /* path '/' and '/ja/' */ });
it('canonical is absolute and keeps the slash', () => expect(doc()).toContain('<link rel="canonical" href="https://smkabir.com/posts/x/"'));
it('hreflang links appear only when both locales exist, with x-default pointing at English', () => { /* … */ });
it('og:image and summary_large_image only when an image is given', () => { /* … */ });
it('loads theme-init.js before the stylesheet and has no inline script', () => {
  const d = doc({ structuredData: [{ '@type': 'BlogPosting', headline: '</script><script>alert(1)</script>' }] });
  const scripts = [...d.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  expect(scripts.every((a) => /\bsrc=/.test(a) || /type="application\/ld\+json"/.test(a))).toBe(true);
  expect(d).not.toContain('</script><script>alert(1)');               // Review Focus 3: jsonLd() must escape "<"
});
it('escapes a hostile title in every place it appears', () => {
  const d = doc({ title: '"><img src=x onerror=1>' });
  expect(d).not.toContain('<img src=x'); expect(d).not.toContain('content=""><img');
});
it('shows the fixture banner only for fixture data', () => { /* source 'fixtures' vs 'cms' */ });
it('adds ec.css and ec.js only when usesCode is set', () => { /* … */ });
it('header marks the current section and hides nav entries whose page does not exist in the locale', () => { /* … */ });
it('language switch links to the alternate when it exists', () => { /* `EN` / `日本語` */ });
```

- [ ] **Step 2: Implement layout, header, footer and the components** by porting each Astro file. Keep class names, element order and attribute order. `data-pagefind-*` attributes are dropped (list this in the parity allow-list of Task 9). Stylesheet and script tags: `<link rel="stylesheet" href="/site/site.css?v=…">`, `<script type="module" src="/site/site.js?v=…">`, the Mulish preload pointing at `/site/fonts/mulish-latin-wght-normal.woff2`.
- [ ] **Step 3: Styles and client scripts.** Copy `global.css` and `fonts.css` byte for byte. Convert the five client scripts from TypeScript to plain JavaScript by hand (remove types only; `search.ts` is not ported). No new behaviour.
- [ ] **Step 4: Write `build-site-assets.mjs`** and the failing `siteAssets.test.ts`. The script writes into `apps/cms/public/site/` (git-ignored):
  - `site.css` = `fonts.css` with every font URL rewritten to `/site/fonts/<file>`, followed by `global.css` without its `@import` lines;
  - `fonts/` = the woff2 files those URLs name, copied from the two fontsource packages;
  - `ec.css`, `ec.js` from `codeAssets()` (Task 5);
  - `site.js` = the five client scripts, each wrapped in its own `(() => { … })();`.

```ts
it('global.css is identical to the Astro site\'s until that site is retired', () =>
  expect(read('apps/cms/src/site/styles/global.css')).toBe(read('apps/site/src/styles/global.css')));
it('every font URL in site.css points at a file that exists', () => { /* run the script into a temp dir; each url(/site/fonts/x) exists */ });
it('site.css has no @import and no node_modules path', () => { /* … */ });
it('new CSS uses tokens only', () => { /* any stylesheet under src/site/styles other than the two copies has no #hex, rgb( or hsl( */ });
```

- [ ] **Step 5: Cache headers** in `next.config.mjs` `headers()`: `/site/:path*` gets `public, max-age=31536000, immutable` in production (assets are always referenced with `?v=`), `/images/:path*` and `/fixtures/:path*` get `public, max-age=3600, s-maxage=86400`. Check the `headers()` shape in the Next 16.4 docs.
- [ ] **Step 6: Run** tests and `typecheck`; run `node apps/cms/scripts/build-site-assets.mjs` and `ls -la apps/cms/public/site`. Expected: PASS; the four files and the fonts folder exist.
- [ ] **Step 7: Commit.** `CMS site: layout, components and static assets`.

---

### Task 7: Pages, router and handler

The site becomes visible in this task.

**Files:**
- Create: `apps/cms/src/site/views/pages/{home,post,projects,project,category,tags,tag,categories,about,now,uses,resume,contact,contact-thanks,typography-test,not-found}.ts`
- Create: `apps/cms/src/site/router.ts`, `handle.ts`, `serve.ts`, `page-cache.ts`, `redirects.ts`
- Modify: `apps/cms/src/app/(site)/[[...path]]/route.ts`
- Test: `apps/cms/tests/router.test.ts`, `apps/cms/tests/handle.test.ts`

**Interfaces:**
- Consumes: `layout` and components (Task 6), `renderRichText` (Task 5), `Site` (Task 3), `siteStore` (Task 4), `pageHeaders` (Task 1).
- Produces:

```ts
// router.ts
export type Route =
  | { kind: 'home' | 'category' | 'tag'; locale: Locale; page: number; category?: CategoryRoute; tag?: string }
  | { kind: 'post' | 'project'; locale: Locale; slug: string }
  | { kind: 'projects' | 'tags' | 'categories' | 'about' | 'now' | 'uses' | 'resume' | 'contact'
        | 'contact-thanks' | 'search' | 'typography-test'; locale: Locale }
  | { kind: 'file'; name: string; locale: Locale; category?: CategoryRoute }       // rss, sitemap, robots, version (Task 8)
  | { kind: 'embed'; id: string };
export function matchRoute(pathname: string): Route | null;
export function listPaths(site: Site): { path: string; locale: Locale; noindex: boolean; lastmod?: string; alternates: Alternates }[];
// handle.ts
export interface SiteRequest { method: string; pathname: string; search: URLSearchParams; ifNoneMatch?: string | null }
export interface SiteResponse { status: number; headers: Record<string, string>; body: string | null }
export function handleSite(req: SiteRequest, site: Site, opts?: { preview?: boolean; redirects?: Readonly<Record<string, string>> }): Promise<SiteResponse>;   // redirects defaults to REDIRECTS
// page-cache.ts
export function pageCacheSize(): number;
// serve.ts
export function serveSite(request: Request, path: string[] | undefined): Promise<Response>;
// redirects.ts
export const REDIRECTS: Readonly<Record<string, string>>;      // old path -> new path, both with slashes; empty today
```

  Each page file exports `(site: Site, route: …) => Promise<Html | null>`; `null` means "no such page in this locale" and becomes a 404. Until Task 10 the `search` route answers 404 and `listPaths` leaves it out; Task 10 adds `/search/` and `/ja/search/` to `listPaths` with `noindex: true`.

- [ ] **Step 1: Write the failing router tests.** URL shapes come from `apps/site/src/pages/`: a listing's first page is its base and later pages are `<base>page/<n>/`.

```ts
it.each([
  ['/', { kind: 'home', locale: 'en', page: 1 }], ['/ja/', { kind: 'home', locale: 'ja', page: 1 }],
  ['/page/2/', { kind: 'home', locale: 'en', page: 2 }],
  ['/posts/hello/', { kind: 'post', locale: 'en', slug: 'hello' }],
  ['/ja/tech/page/3/', { kind: 'category', locale: 'ja', category: 'tech', page: 3 }],
  ['/tags/k8s/', { kind: 'tag', locale: 'en', tag: 'k8s', page: 1 }],
  ['/contact/thanks/', { kind: 'contact-thanks', locale: 'en' }],
  ['/embeds/0a1b2c.html', { kind: 'embed', id: '0a1b2c' }],
])('%s', (p, r) => expect(matchRoute(p)).toMatchObject(r));
it.each(['/page/1/', '/page/0/', '/page/01/', '/page/-1/', '/page/2x/', '/page/1e3/', '/tags/k8s/page/1/',      // Review Focus 5
  '/en/', '/ja/ja/', '/posts/', '/posts/a/b/', '/posts/<script>/', '/posts/a%2Fb/', '/japan-life/', '/POSTS/hello/',
  '/embeds/../x.html', '/embeds/x.htm', '/404.html', '/' + 'a'.repeat(600) + '/'])(
  '%s matches nothing', (p) => expect(matchRoute(p)).toBeNull());
it('page numbers above 100000 match nothing', () => expect(matchRoute('/page/999999/')).toBeNull());
it('listPaths has no duplicates, every entry ends in "/", and every entry matches a route', () => { /* fixture site */ });
```

  A slug segment must pass `SLUG_PATTERN` from `apps/cms/src/hooks/slug.ts` (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`); import it, do not copy it.
- [ ] **Step 2: Implement `router.ts`** as a small hand-written matcher on path segments, no regex built from input.
- [ ] **Step 3: Write the failing handler tests** on fixture data (`handleSite` needs no server).

```ts
const req = (pathname: string, extra = {}) => ({ method: 'GET', pathname, search: new URLSearchParams(), ...extra });
const get = (pathname: string, extra = {}) => handleSite(req(pathname, extra), site);
it('every listed path answers 200 with a complete document', async () => {
  for (const { path } of listPaths(site)) {
    const r = await get(path);
    expect(r.status, path).toBe(200);
    expect(r.body, path).toMatch(/^<!doctype html>[\s\S]+<\/html>\s*$/);
  }
});
it('an unknown path answers 404 with the English not-found page and is not cached', async () => {
  const r = await get('/posts/nope/'); expect(r.status).toBe(404); expect(r.body).toContain('<html lang="en">');
});
it('a listing page beyond the last answers 404', async () => expect((await get('/page/999/')).status).toBe(404));
it('a post that exists only in English is 404 under /ja/', async () => { /* take one from the fixtures; skip if none */ });
it('POST answers 405 with Allow: GET, HEAD', async () => { /* … */ });
it('HEAD answers the headers of GET and no body', async () => { /* … */ });
it('sends a weak ETag and answers 304 to a matching If-None-Match', async () => {
  const a = await get('/'); expect(a.headers.ETag).toMatch(/^W\/"/);
  const b = await get('/', { ifNoneMatch: a.headers.ETag }); expect(b.status).toBe(304); expect(b.body).toBeNull();
});
it('HTML is never cached by a shared cache', async () =>
  expect((await get('/')).headers['Cache-Control']).toBe('public, max-age=0, must-revalidate'));
it('carries the page security headers on 200 and on 404', async () => { /* Content-Security-Policy present on both */ });
it('one page that throws answers 500 and leaves the others working', async () => {
  /* a site whose first post has a node of type 'marquee': that post 500, '/' and another post 200 */
});
it('a redirect entry answers 301 to the new path', async () => {
  const r = await handleSite(req('/old/'), site, { redirects: { '/old/': '/posts/new/' } });
  expect(r.status).toBe(301); expect(r.headers.Location).toBe('/posts/new/');
});
it('the page cache never grows past its cap', async () => {                                   // Review Focus 5
  for (let i = 0; i < 2000; i++) await get(`/posts/nope-${i}/`);
  expect(pageCacheSize()).toBeLessThanOrEqual(500);
});
```

- [ ] **Step 4: Implement the pages, `handle.ts`, `page-cache.ts`, `serve.ts`.** Each page is a port of the Astro page of the same name (`[category]/[...page].astro` → `category.ts`, `page/[page].astro` → `home.ts`, and so on); `404.astro` → `not-found.ts`. `handle.ts`: method check, `REDIRECTS`, `matchRoute`, page render, layout, ETag (`W/"<site.version>-<sha1 of body, 12 hex>"`), cache. The page cache is an LRU of 500 entries keyed `<version>|<pathname>`; only 200 responses are stored; preview responses never are. `serve.ts` builds the pathname as `'/' + path.join('/') + '/'` (or `/` when `path` is empty; a last segment with a dot gets no slash), gets the site from `siteStore().get()`, and answers `503` with `Retry-After: 5` and a plain text body when that rejects. The route file becomes three lines calling `serveSite` for `GET` and `HEAD`.
- [ ] **Step 5: Run** all tests and `typecheck`. Expected: PASS.
- [ ] **Step 6: GATE.** Dev server on the seeded `pg-stg` database. Show the owner: `curl -s -o /dev/null -w '%{http_code} %{time_total}\n'` for `/`, `/ja/`, one post in each language, `/tech/`, `/tags/`, `/about/`, `/nope/` (404). Then open `http://localhost:3100/` in a browser and report, with a screenshot of the home page and one post in light and dark mode, anything that looks different from `https://smkabir.com`. Then the two-second check: publish a new post in the admin and show a `curl` loop finding it on `/` within two seconds; unpublish it and show it gone.
- [ ] **Step 7: Commit.** `CMS site: pages, router and request handler`.

---

### Task 8: Feeds, sitemap, robots, version and embeds

**Files:**
- Create: `apps/cms/src/site/files/{rss,sitemap,robots,version,embed}.ts`
- Modify: `apps/cms/src/site/router.ts` (file routes), `apps/cms/src/site/handle.ts`
- Test: `apps/cms/tests/siteFiles.test.ts`

**Interfaces:**
- Consumes: `Site`, `listPaths`, `feed` helpers (`lib/feed.ts`), `embeds` helpers (`lib/embeds.ts`), `embedHeaders`.
- Produces: `rssXml(site, locale, category?): string`, `sitemapIndexXml(): string`, `sitemapXml(site): string`, `robotsTxt(): string`, `versionJson(site, status): string`, `embedHtml(site, id): string | null`.

Paths: `/rss.xml`, `/ja/rss.xml`, `/tech/rss.xml`, `/finance/rss.xml`, `/japan/rss.xml` (English only, as today), `/sitemap-index.xml`, `/sitemap-0.xml`, `/robots.txt`, `/version.json`, `/embeds/<id>.html`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('rss is well-formed, lists posts newest first and uses absolute links with slashes', () => { /* parse with a tiny check: one <channel>, N <item>, each <link> starts https://smkabir.com/ and ends "/" */ });
it('rss escapes a title containing "&" and "]]>"', () => { /* … */ });
it('the Japanese feed lists only posts that exist in Japanese', () => { /* … */ });
it('category feeds exist in English only', async () => expect((await get('/ja/tech/rss.xml')).status).toBe(404));
it('the sitemap lists every indexable path once, with xhtml:link alternates and lastmod on posts', () => {
  const xml = sitemapXml(site);
  for (const p of listPaths(site).filter((x) => !x.noindex)) expect(xml).toContain(`<loc>https://smkabir.com${p.path}</loc>`);
  for (const p of listPaths(site).filter((x) => x.noindex)) expect(xml).not.toContain(`<loc>https://smkabir.com${p.path}</loc>`);
});
it('robots.txt allows everything and names the sitemap index', () => { /* same lines as apps/site/src/pages/robots.txt.ts */ });
it('version.json reports build_id, content version and loadedAt, with no-store', () => { /* build_id = process.env.BUILD_ID ?? ASSET_VERSION */ });
it('an embed answers its author HTML with the embed header set and immutable caching', async () => {
  const [id] = site.embeds().keys(); const r = await get(`/embeds/${id}.html`);
  expect(r.status).toBe(200); expect(r.headers['Content-Security-Policy']).toBe(embedHeaders()['Content-Security-Policy']);
  expect(r.headers['Cache-Control']).toContain('immutable');
});
it('an unknown embed id is 404', async () => expect((await get('/embeds/ffffffff.html')).status).toBe(404));
```

- [ ] **Step 2: Implement.** RSS is written by hand through an XML-escaping helper (do not add `@astrojs/rss`); item fields match what `apps/site/src/pages/[...locale]/rss.xml.ts` emits. The sitemap follows what `@astrojs/sitemap` writes for this site today (compare with `apps/site/dist/sitemap-0.xml` after the Task 9 build). Embeds are found in `site.embeds()`; the document comes from the existing `lib/embeds.ts` builder. Content types: `application/rss+xml; charset=utf-8`, `application/xml; charset=utf-8`, `text/plain; charset=utf-8`, `application/json`, `text/html; charset=utf-8`. Feeds and sitemap: `Cache-Control: public, max-age=0, must-revalidate`.
- [ ] **Step 3: Run.** Expected: PASS.
- [ ] **Step 4: Commit.** `CMS site: feeds, sitemap, robots, version and embeds`.

---

### Task 9: Parity with the Astro output

The objective finish line: the same content in gives the same pages out.

**Files:**
- Create: `apps/cms/tests/parity.test.ts`, `apps/cms/tests/parity-allow.ts`
- Modify: `apps/cms/package.json` (script `test:parity`), root `package.json` (`cms:parity`)

**Interfaces:**
- Consumes: `loadFixtureData`, `createSite`, `listPaths`, `handleSite`.

- [ ] **Step 1: Build the baseline.** `SITE_CONTENT=fixtures $P build` (needs d2 from the Working environment). Expected: `apps/site/dist/index.html` exists.
- [ ] **Step 2: Write the test.** It runs only when `PARITY_DIST` is set (`describe.skipIf(!process.env.PARITY_DIST)`). For both sides it uses the fixture data.
  1. **Same set of pages:** the set of `listPaths(site)` paths equals the set of directories in `dist/` holding an `index.html`, with `/search/`, `/ja/search/` and `/pagefind/` left out of both sides.
  2. **Same page:** for each path, `normalise(dist html)` equals `normalise(handler html)`. `normalise` parses nothing; it applies a fixed list of textual rules from `parity-allow.ts`, then collapses whitespace between tags.
  3. **Same feeds:** `/rss.xml` and `/ja/rss.xml` equal after removing `<lastBuildDate>`.
- [ ] **Step 3: The allow-list.** Every rule in `parity-allow.ts` is `{ name, reason, apply(html): string }`. Start with exactly these:
  - `asset-urls`: `/_astro/<name>.<hash>.css|js|woff2` and `/site/<name>…?v=…` both become `ASSET`; the count of stylesheet and script tags may differ and is compared separately (Astro splits per page).
  - `pagefind-attributes`: `data-pagefind-*` attributes and the two `<meta data-pagefind-filter>` tags removed from the Astro side.
  - `astro-attributes`: `data-astro-cid-*`, `data-astro-source-*` removed.
  - `expressive-code-ids`: generated ids inside code frames replaced by a counter.
  - `search-link`: nothing; listed so the next person sees that search pages are excluded, not compared.

  Any further rule needs a one-line reason and goes in the report of Step 5. A difference in text, link targets, headings, meta tags, JSON-LD, image sources or class names is never allowed: fix the port.
- [ ] **Step 4: Run** `PARITY_DIST=apps/site/dist $P --filter @smkabir/cms test:parity`. Fix the port until it passes.
- [ ] **Step 5: GATE.** Show the owner the test output and the final allow-list with reasons. **STOP** if a rule beyond the five above was needed, and wait for approval of each.
- [ ] **Step 6: Commit.** `CMS site: parity test against the Astro build`.

---

### Task 10: Search on the server

Replaces Pagefind. A plain form and a plain results page; no client script.

**Files:**
- Create: `apps/cms/src/site/search.ts`, `apps/cms/src/site/views/pages/search.ts`, `apps/cms/src/site/styles/search.css` (appended to `site.css` by the asset script)
- Modify: `apps/cms/src/site/handle.ts`, `apps/cms/src/site/router.ts` (`listPaths` gains the two search paths, `noindex: true`), `apps/cms/tests/parity.test.ts` (drop them from the handler side too), `apps/cms/scripts/build-site-assets.mjs`, `apps/cms/src/site/i18n/{en,ja}.json` (only if a needed string is missing; reuse `search.placeholder`, `search.noResults`, `search.oneResult`, `search.manyResults`)
- Test: `apps/cms/tests/search.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SearchHit { kind: 'post' | 'project' | 'page'; title: string; description: string; path: string; score: number }
export function searchSite(site: Site, locale: Locale, query: string, limit?: number): SearchHit[];   // limit default 30
export const MAX_QUERY = 100;
```

- [ ] **Step 1: Write the failing tests.**

```ts
it('finds a post by a word in its title and ranks a title hit above a body hit', () => { /* … */ });
it('matches Japanese text and full-width forms', () => { /* a ja fixture title; 'ＡＢＣ' finds 'abc' (NFKC) */ });
it('searches only the requested locale', () => { /* … */ });
it('an empty or whitespace query returns nothing', () => expect(searchSite(site, 'en', '   ')).toEqual([]));
it('treats regex characters as text', () => expect(() => searchSite(site, 'en', '(.*)+$[')).not.toThrow());
it('uses at most the first 100 characters of the query', () => {                              // Review Focus 5
  const word = 'kubernetes'; expect(searchSite(site, 'en', word + ' '.repeat(100) + 'zzzz')).toEqual(searchSite(site, 'en', word));
});
it('returns at most 30 hits', () => { /* … */ });
it('the page echoes the query escaped and is noindex and uncached', async () => {             // Review Focus 3
  const r = await handleSite({ method: 'GET', pathname: '/search/', search: new URLSearchParams({ q: '"><img src=x onerror=alert(1)>' }) }, site);
  expect(r.status).toBe(200);
  expect(r.body).not.toContain('<img src=x');
  expect(r.body).toContain('<meta name="robots" content="noindex"');
  expect(r.headers['Cache-Control']).toBe('private, no-store');
});
it('the form is a GET form with one text field named q and needs no script', () => { /* <form method="get" action="/search/"> */ });
```

- [ ] **Step 2: Implement.** Normalise with `String.prototype.normalize('NFKC')` and `toLowerCase()`; split the query on whitespace; a document matches when every term is a substring of its searchable text. Score per term: title 3, tags 2, description 2, body 1. Body text comes from the existing lexical plain-text walker. The searchable text per document is built once per `Site` (memoised in a `WeakMap<Site, …>`). Ties sort newest first. Search responses are never put in the page cache.
- [ ] **Step 3: Styles.** `search.css` styles the form and the result list with existing tokens only, following docs/design.md section 10. Result items reuse the markup of an existing list where one fits.
- [ ] **Step 4: Run** tests (including the token check from Task 6). Expected: PASS.
- [ ] **Step 5: GATE.** Dev server: screenshots of `/search/?q=<a real word>` and `/ja/search/?q=<日本語の語>` in light and dark mode for the owner.
- [ ] **Step 6: Commit.** `CMS site: server-side search`.

---

### Task 11: Preview of unpublished changes

**Files:**
- Create: `apps/cms/src/app/preview/[[...path]]/route.ts`, `apps/cms/src/site/preview.ts`, `apps/cms/src/site/client/preview.js`
- Modify: `apps/cms/src/collections/{Posts,Pages,Projects}.ts`, `apps/cms/src/globals/index.ts` (or `payload.config.ts`, wherever the docs place `admin.livePreview`), `apps/cms/src/site/i18n/{en,ja}.json` (`preview.banner`), `apps/cms/scripts/build-site-assets.mjs` (writes `preview.js` on its own, not into `site.js`)
- Test: `apps/cms/tests/preview.test.ts`

**Interfaces:**
- Consumes: `loadRaw`, `mapAll`, `createSite`, `handleSite`, `pageHeaders({ preview: true })`.
- Produces: `previewPath(kind: 'posts' | 'pages' | 'projects' | 'now' | 'uses' | 'resume', slug: string | undefined, locale: Locale): string` (for example `('posts', 'x', 'ja')` gives `/preview/ja/posts/x/`).

- [ ] **Step 1: Write the failing tests.**

```ts
it.each([[['posts', 'x', 'en'], '/preview/posts/x/'], [['posts', 'x', 'ja'], '/preview/ja/posts/x/'],
  [['projects', 'p', 'en'], '/preview/projects/p/'], [['pages', 'about', 'ja'], '/preview/ja/about/'],
  [['now', undefined, 'en'], '/preview/now/']])('%j', (args, out) => expect(previewPath(...args)).toBe(out));
it('a draft post is visible through handleSite in preview mode and absent otherwise', async () => { /* fixture with _status 'draft' */ });
it('preview responses are noindex, private and frameable only by the same origin', async () => {
  const r = await handleSite(req('/posts/x/'), previewSite, { preview: true });
  expect(r.headers['X-Robots-Tag']).toBe('noindex'); expect(r.headers['Cache-Control']).toBe('private, no-store');
  expect(r.headers['Content-Security-Policy']).toContain("frame-ancestors 'self'");
});
it('a slug with odd characters cannot leave /preview/', () => expect(previewPath('posts', '../../admin', 'en')).toMatch(/^\/preview\/posts\/[^/]+\/$/));
```

- [ ] **Step 2: Implement the route.** `GET` only. `const { user } = await payload.auth({ headers: request.headers })`; no user → `401` plain text. Then `loadRaw(payload, { draft: true })`, `mapAll`, `createSite(data, { source: 'cms', version: 'preview', preview: true })`, `handleSite(…, { preview: true })`. No snapshot store and no page cache: a preview is always fresh. The layout gets a banner (`preview.banner`, both languages) and one extra script tag for `/site/preview.js`. Links inside a preview are not rewritten: they lead to the published pages, which the CMS hostname also serves (behind Access). That keeps the views free of a preview mode. The public-host 404 for `/preview` is already in the gate (Task 1).
- [ ] **Step 3: Wire the admin.** `admin.preview` and `admin.livePreview.url` for posts, pages, projects and the globals now, uses, resume, each returning `previewPath(…)` for the document and the locale being edited. Verify the option names and callback arguments in the Payload 3.90 live-preview docs.
- [ ] **Step 4: Refresh on save.** Read the installed `@payloadcms/live-preview` 3.90.2 source for `ready` and `isDocumentEvent`. `client/preview.js` (about 15 lines, plain JS): post the ready message to the parent, and on a document event from the same origin call `location.reload()`. If the message shape in the source differs from the docs, **STOP** and report; the fallback is no auto-refresh (the editor presses reload), which is acceptable.
- [ ] **Step 5: GATE.** Dev server: edit a draft post in the admin, show the live-preview pane rendering it, and show `curl -s -o /dev/null -w '%{http_code}' localhost:3100/posts/<that-slug>/` answering 404 while it is a draft.
- [ ] **Step 6: Commit.** `CMS: preview of drafts under /preview/`.

---

### Task 12: The agent says where a page is live

**Files:**
- Modify: `apps/cms/src/mcp/posts.ts` (the `publish_post` reply, line ~288), `apps/cms/src/mcp/docs.ts` (two replies, lines ~182 and ~341), `apps/cms/src/mcp/guide.ts` (wording), `apps/cms/scripts/check-agent*.mjs` (expectations), `docs/agents.md`
- Test: `apps/cms/tests/agentLive.test.ts`

**Interfaces:**
- Consumes: `siteStore`, `Site.pageBlockers`, `mapAll`.
- Produces: `liveReport(post: Post, site: Site, origin: string): { live: Partial<Record<Locale, string>>; notLive: Partial<Record<Locale, string[]>> }` in `apps/cms/src/mcp/shared.ts`.

- [ ] **Step 1: Write the failing test.**

```ts
it('reports a URL for each complete locale and reasons for the others', () => {
  const r = liveReport(postWithoutJaTitle, site, 'https://smkabir.com');
  expect(r.live).toEqual({ en: `https://smkabir.com/posts/${postWithoutJaTitle.slug}/` });
  expect(r.notLive).toEqual({ ja: ['title'] });
});
it('reports nothing live for a draft', () => { /* live {}, notLive.en contains 'status' */ });
```

- [ ] **Step 2: Implement.** After a successful publish the tool calls `siteStore().invalidate()`, awaits `siteStore().get()`, and returns `{ id, results, ...liveReport(…) }`. Replace all three "The site rebuilds after a publish; it can take a few minutes to appear." notes; pages and projects return their one live URL per locale the same way. `origin` is `https://` plus the first entry of `SITE_PUBLIC_HOSTS`. Every write still goes through `agentGuards.ts` unchanged: this task touches replies only.
- [ ] **Step 3: Run** `$P --filter @smkabir/cms test`, then with the dev server up: `$P cms:check-agent && $P cms:check-scope && $P cms:check-hooks`. Expected: all pass. Restart the dev server first (tools are registered at startup).
- [ ] **Step 4: Update `docs/agents.md`:** the publish reply, the fact that a publish is live at once, and that `AGENT_AUTO_PUBLISH` therefore decides whether the agent can change the public site without a person. Mark snippets production-ready or illustrative.
- [ ] **Step 5: Commit.** `CMS agent: publish replies report live URLs`.

---

### Task 13: Image, CI and changelog

**Files:**
- Modify: `apps/cms/Dockerfile`, `apps/cms/tests/image-smoke.sh`, `.github/workflows/release.yml`, `docs/versions.md`, `CHANGELOG.md`, `apps/cms/scripts/build-site-assets.mjs`

- [ ] **Step 1: Dockerfile.**
  - A new stage downloads `d2-v0.9.0-linux-amd64.tar.gz` and verifies it against the SHA-256 published with the release (hash written in the Dockerfile and in `docs/versions.md`); the runtime stage copies only the `d2` binary to `/usr/local/bin/d2`.
  - The build stage runs the asset script (it is `prebuild`) and needs `apps/site/public/images` and `apps/site/public/fixtures` in the context: the asset script copies both into `apps/cms/public/` (git-ignored) so old `/images/…` and `/fixtures/…` URLs keep resolving.
  - The runtime stage copies `apps/cms/public` to `apps/cms/public` next to `server.js` (Next standalone does not copy it).
  - Still `--platform linux/amd64`, uid 10001, no new writable path. d2 must work with a read-only root and `/tmp` as the only writable folder; if it wants a home or cache folder, point it at `/tmp` with an environment variable found in the d2 docs.
- [ ] **Step 2: Smoke test additions** in `image-smoke.sh`, in the script's existing `check` style (it runs without a database):

```bash
base="http://127.0.0.1:${port}"
check "public host: / is not behind Access (no database -> 503)" 503 "$(code -H 'Host: smkabir.com' "$base/")"
check "public host: /admin is hidden"            404 "$(code -H 'Host: smkabir.com' "$base/admin")"
check "public host: /api is hidden"              404 "$(code -H 'Host: smkabir.com' "$base/api/posts")"
check "public host: /preview is hidden"          404 "$(code -H 'Host: smkabir.com' "$base/preview/")"
check "public host: stylesheet is served"        200 "$(code -H 'Host: smkabir.com' "$base/site/site.css")"
check "public host: old image URL still works"   200 "$(code -H 'Host: smkabir.com' "$base/images/<one committed file>")"
check "cms host: / needs Access"                 401 "$(code -H 'Host: cms.smkabir.com' "$base/")"
check "unknown host: / needs Access"             401 "$(code -H 'Host: x.example' "$base/")"
```

  Run these in the section that has Access configured, with `-e SITE_PUBLIC_HOSTS=smkabir.com`. Add two in-container checks under the same restrictions (`--read-only`, uid 10001): `d2 --version` prints `0.9.0`, and `echo 'a -> b' | d2 - -` prints an `<svg`; and `node -e "import('rehype-expressive-code').then(m => m.createRenderer({})).then(() => console.log('ok'))"` run from `/app/apps/cms` prints `ok`.
- [ ] **Step 3: GATE.** `open -a Docker`, then `$P server:test` is not needed; run `docker build --platform linux/amd64 -f apps/cms/Dockerfile -t kabir-blog-cms:test . && bash apps/cms/tests/image-smoke.sh`. Show the output. Then `docker image rm kabir-blog-cms:test && docker builder prune -f` (disk).
- [ ] **Step 4: Release workflow.** In `release.yml` (jobs `verify`, `image`, `cms-image`): `verify` keeps the unit tests and gains, while `apps/site` exists, the parity test (install d2 by SHA-256, build the Astro site on fixtures, `PARITY_DIST=…`). The image scan stays as it is. If trivy reports the d2 binary: **STOP**. A `skip-files` or ignore entry is the owner's decision, never the implementer's. Check any workflow input name against the action's README at its pinned commit.
- [ ] **Step 5: `docs/versions.md`** gains d2 0.9.0 (both platform hashes), `rehype-expressive-code` 0.44.2 as a direct dependency, and the two Next config keys verified in Task 1. **`CHANGELOG.md`:** extend the existing `## 0.3.0 - unreleased` entry: the public site is served by the CMS app; publish is live at once; server-side search; preview; the content dispatch is gone; `/_astro/` and `/pagefind/` URLs end; new variable `SITE_PUBLIC_HOSTS`. Do not date the entry and do not tag: the owner releases.
- [ ] **Step 6: Run** `$P test && $P --filter @smkabir/cms typecheck && $P format:check && $P privacy`. Expected: PASS.
- [ ] **Step 7: Commit.** `CMS 0.3.0: image serves the public site; smoke and release checks`.

---

### Task 14: Deploy drafts and the cutover runbook

Writing only. Nothing in this task changes a cluster.

**Files:**
- Modify: `deploy/homelab-terraform/prod/apps/cms/cms.yaml`, `deploy/homelab-terraform/seal-cms-extras.sh`, `docs/cutover.md` (rewrite), `docs/deploy.md`, `docs/secrets.md`, `docs/cms.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: CMS draft manifest.** Image tag `0.3.0`; `replicas: 1` with a comment that the content snapshot lives in the process; strategy `Recreate`; env `SITE_PUBLIC_HOSTS: smkabir.com`; `AGENT_AUTO_PUBLISH: '1'` on its own line with the comment `# owner's decision: with this set, the agent changes the public site without review`; no `GITHUB_DISPATCH_TOKEN` and no `cms-github` secret reference (remove both from `seal-cms-extras.sh`, `docs/secrets.md` and `docs/deploy.md` too, and add "delete the `cms-github` SealedSecret and revoke the token" to the owner's list in the runbook); memory request raised if the dev measurements of Task 7 call for it (state the measured resident size). Readiness stays `/readyz`.
- [ ] **Step 2: Apex route draft.** A second `HTTPRoute` on Gateway `public` with `sectionName: https-apex`, hostname `smkabir.com`, backend the CMS Service. The existing `cms.smkabir.com` route (`https-wildcard`) is untouched. Never an Ingress. Note in the draft that the route's namespace must be allowed by the Gateway listener, as the blog's route is today.
- [ ] **Step 3: Rewrite `docs/cutover.md`** as a numbered runbook for the owner, each step with its check and its undo:
  1. Prove a `pg-main` restore (existing procedure in the homelab-terraform docs).
  2. Release: push `main`, push tag `v0.3.0`, wait for the release workflow and the image on GHCR.
  3. In homelab-terraform: bump the CMS tag and add the env from Step 1 (migration `20261101_145841_mcp_full_content` runs at start). The public site is still the old one. Check the admin, `/readyz`, the agent (`cms:check-agent` against production).
  4. Import the posts: `IMPORT_APPLY=1 $P cms:import` against production, then compare counts (12 posts; projects, pages, tags, media) with the dry run.
  5. Check media from outside: `curl -sI "$MEDIA_PUBLIC_URL/<one file>"` answers 200 with no Access prompt. If it does not, stop here.
  6. Check the new site before it is public: `kubectl -n <cms namespace> port-forward` to the pod and `curl -H 'Host: smkabir.com' localhost:<port>/` for the home page, one post in each language, `/rss.xml`, `/sitemap-index.xml`; compare the list of paths with the live sitemap (a one-line `diff` of sorted `<loc>` values, command written out).
  7. Switch: one commit in homelab-terraform that adds the apex route to the CMS and removes it from the blog. Check `https://smkabir.com/version.json` shows the new shape, then purge the Cloudflare cache.
  8. Rollback: `git revert` of the commit from 7.
  9. A week later, if all is well: Task 15.
- [ ] **Step 4: Other docs.** `docs/deploy.md` (one image now carries the site; content needs no release), `docs/cms.md` (hooks, snapshot, preview, search), `README.md` and `CLAUDE.md` (architecture and commands; keep every rule that still applies; the "Content release flow" paragraph is replaced by the new three-step flow: publish → hook → next request loads the snapshot). Snippets marked production-ready or illustrative; Japanese terms with Romaji.
- [ ] **Step 5: Run** `$P format:check && $P privacy`. **GATE:** show the owner the two draft manifests and the runbook.
- [ ] **Step 6: Commit.** `docs: single-app deploy drafts and cutover runbook`.

---

### Task 15: Retire the static stack (only after the owner says so)

**STOP before this task.** It starts when the owner confirms the new site has been live and healthy. It ships as its own release (`0.3.1` or later).

**Files:**
- Move: `apps/site/src/content/fixtures/` → `apps/cms/fixtures/content/`, `apps/site/public/{images,fixtures}` → `apps/cms/public/{images,fixtures}` (now committed), the tests' `payload-raw.json` stays where Task 4 put it
- Modify: `apps/cms/src/scripts/fixtureModel.ts` and `import-fixtures.ts`, `apps/cms/src/site/data/fixtures.ts`, `apps/cms/scripts/build-site-assets.mjs` (no more copying), root `package.json`, `pnpm-workspace.yaml`, `.github/workflows/release.yml`, `.gitignore`, `README.md`, `CLAUDE.md`, `docs/*`
- Delete: `apps/site/`, `apps/server/`, `.github/workflows/content.yml`, `.github/workflows/content-rollback.yml`, `scripts/ci/release.sh` and its tests, `apps/cms/tests/parity*.ts`, the `global.css` identity test, the `server:*` and site scripts in the root `package.json`

- [ ] **Step 1:** Move the fixtures and public files; fix the three readers; `$P cms:seed` on a fresh `pg-stg` database still works (**GATE**: show the counts).
- [ ] **Step 2:** Delete the apps and workflows; move `security-headers.json` ownership notes into `docs/cms.md`; `grep -rn "apps/site\|apps/server\|content.yml\|LATEST\|VERIFIED\|pagefind" --exclude-dir=node_modules --exclude=CHANGELOG.md .` comes back empty apart from history notes in docs.
- [ ] **Step 3:** `$P install && $P test && $P --filter @smkabir/cms typecheck && $P --filter @smkabir/cms build`. Expected: PASS.
- [ ] **Step 4:** CHANGELOG entry; list for the owner what remains outside this repository: the blog Deployment and its route in homelab-terraform, the R2 `releases/` prefix and `LATEST`/`VERIFIED` objects, the GitHub secrets the content workflows used, the Cloudflare API token for cache purges if nothing else uses it.
- [ ] **Step 5: Commit.** `Retire the Astro site, the nginx image and the content pipeline`.

---

## Done means

- `$P test`, `typecheck`, `format:check`, `privacy` and the image smoke test pass; the parity test passes with only the approved allow-list.
- On the dev server, a publish, an edit, an unpublish and a delete each show on the public pages within two seconds.
- Every gate's output has been shown to the owner, and every STOP was answered.
- Nothing was pushed, tagged or applied to a cluster by the implementer.
