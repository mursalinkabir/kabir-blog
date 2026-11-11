# Letting an AI agent write and publish posts

An AI agent (Claude Code, Claude Desktop, any MCP client) can write and edit the site's content in **English and
Japanese** through the CMS's MCP endpoint: posts, pages, projects, tags, category names, image details, and the Now,
Uses, Resume and Site settings. It writes Markdown; the CMS turns it into the same structured content the site
renders, applies the publishing rules **inside the CMS**, and records everything it does. It never deletes anything.

Snippets are marked **production-ready** or **illustrative**.

## Status

| Part                                                        | Works today                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tools, rules, audit log, kill switch                        | Yes, against the local CMS (`check:agent` 28 on / 22 off, publish semantics 14, scope 71 on / 12 off, hooks 20, 83 unit tests) |
| Agent-published posts build on the site                     | Yes: pulled and built, every dist gate passes                                                                                  |
| Pages, projects, settings, words, edits to a person's posts | Yes, same checks (`pnpm cms:check-scope`, `cms:check-hooks`)                                                                   |
| Remote agent against the live CMS                           | After the cutover in [cutover.md](cutover.md) (service token, builder key, `CMS_URL`)                                          |
| Publishing triggers a site rebuild                          | Hook is built; needs `GITHUB_DISPATCH_TOKEN` and `CMS_URL` for CI to see the CMS                                               |

## Connect Claude Code and Claude Desktop locally (production-ready commands)

Both clients launch a small local program (`apps/cms/scripts/mcp-stdio-bridge.mjs`) that forwards to the CMS. It
reads the agent's key from `apps/cms/.dev-credentials` (git-ignored, mode 0600), so **no key is written into either
client's config file**, and Claude Desktop, which cannot send an `Authorization` header to a local server, works too.

```sh
docker compose up -d postgres
npx pnpm@12.9.1 cms:migrate
npx pnpm@12.9.1 cms:agent-key           # creates the agent user and its key in apps/cms/.dev-credentials
npx pnpm@12.9.1 cms:dev                 # http://localhost:3100 (the agent needs the CMS running)
npx pnpm@12.9.1 cms:install-claude      # adds "kabir-blog" to Claude Desktop's config (with a backup)
claude mcp add --scope user kabir-blog -- "$(command -v node)" "$PWD/apps/cms/scripts/mcp-stdio-bridge.mjs"
```

Quit and reopen Claude Desktop once. `claude mcp list` should show `kabir-blog ... Connected`. To undo:
`node apps/cms/scripts/install-claude-clients.mjs --remove` and `claude mcp remove kabir-blog`.

A client that can send headers (a remote agent, later) can use the HTTP endpoint directly instead
(illustrative):

```sh
claude mcp add --transport http kabir-blog https://cms.smkabir.com/api/mcp --header "Authorization: Bearer <key>"
```

Then ask the agent, for example: _"Read the site guide, then write a short post in English and Japanese about
what the homelab costs to run. Upload no images. Check it and publish if it passes."_ The agent starts with
`site_guide`, which tells it the rules, the categories and tags, and the Markdown dialect.

**Going live is off until you turn it on.** With `AGENT_AUTO_PUBLISH` unset or not exactly `1` the agent can write and
check drafts (posts, pages, projects), and edit tags, category names and image details; every `publish_*` tool and every
save of Now, Uses, Resume or Site is refused with an explanation, and only unpublishing still works. Set `AGENT_AUTO_PUBLISH=1` in the CMS environment and
restart it to allow publishing. Setting it back to `0` is the kill switch.

## What it can change

| Content                          | Can do                                                            | Stays with an admin                                        |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Posts, pages, projects           | Create, edit any of them (draft first), check, publish, unpublish | Delete; adding an HTML embed or photo strip                |
| Tags                             | Create, name in a language                                        | Delete; the slug                                           |
| Category names                   | Rename in a language                                              | Create, delete, the slug (a new category is a site change) |
| Images (media)                   | Upload; edit alt text, caption, credit                            | Replace the file; delete                                   |
| Now, Uses, Resume, Site settings | Edit (**live as soon as saved**)                                  | The contact email (`site.email`, `resume.basics.email`)    |
| Users, API keys, the audit log   | Nothing                                                           | Everything                                                 |

An agent edits **any** post, not only its own. An embed or photo strip a person put in a document stays (the agent
gets it back as `[[keep:id]]` and the save is refused if it is new or altered). Every edit of an existing document
names the version the agent read (`expected_updated_at`, or `expected_version` for the four settings), and Payload's
document lock is respected: an edit is refused if the document changed since the read or is open in the admin.

## The tools

| Area        | Tools                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Orientation | `site_guide` (always first: the rules, limits, categories, tags, Markdown dialect)                                       |
| Posts       | `list_posts`, `get_post`, `create_draft`, `update_draft`, `check_post`, `publish_post`, `unpublish_post`, `upload_image` |
| Pages       | `list_pages`, `get_page`, `save_page`, `check_page`, `publish_page`, `unpublish_page`                                    |
| Projects    | `list_projects`, `get_project`, `save_project`, `check_project`, `publish_project`, `unpublish_project`                  |
| Words       | `list_tags`, `update_tag`, `list_categories`, `update_category_name`, `list_media`, `update_media`                       |
| Settings    | `get_global` (site, now, uses, resume), `update_now`, `update_uses`, `update_resume`, `update_site`                      |

Details that matter:

- `update_draft` also changes category, cover image, series, contents list and dates. `get_*` returns `updatedAt`
  (settings: `version`); send it back as `expected_updated_at` (`expected_version`).
- `publish_post`, `publish_page` and `publish_project` put **every language that has content** live together (Payload
  promotes the whole latest draft), so each language must pass the rules.
- `update_uses` takes the whole list and the rows' ids from `get_global`. Rows left out would be deleted in **both**
  languages, so that needs `remove_missing: true`. `update_resume` replaces whole sections and refuses to shrink one
  unless `allow_shrink: true`; `update_site` does the same for the social buttons.
- Social buttons must be `https://` on an allowed host (`AGENT_SOCIAL_HOSTS`, default github.com, linkedin.com, x.com,
  mastodon.social, bsky.app, youtube.com, zenn.dev, qiita.com). Project and resume links must be `https://` or a path
  inside the site; a link that was already there is never the agent's problem.
- A key can switch any single tool off in the admin (**MCP > API keys**). To keep a browsing agent away from the
  high-impact settings, untick `update_site`, `update_resume`, `update_uses`, `update_now` and the `publish_*` tools.

## The writing format

CommonMark plus GFM tables, task lists and `~~strike~~`, and four extensions (production-ready):

````md
:::note Optional title <- callout: note | warn | danger, ends with a line containing only :::
Text of the callout.
:::

```terminal
pnpm build
---
output goes here
```

```ts src/lib/example.ts {2,4-6}
const answer = 42;
```

```d2 alt="what the diagram shows"
a -> b
```

An inline Japanese term: {{本免許|honmenkyo|full driving licence}}.

![](media:42 'Caption') <- 42 is the id returned by upload_image
````

Refused with a message the agent can act on: raw HTML, remote images, `javascript:` and other unsafe links, nested
callouts. `# H1` becomes `##`.

## What the CMS enforces

Enforcement is in the CMS, so it holds for anything that uses the agent's key, not only these tools.

| Rule                                                                                                                                                                                              | Where                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Only an `agent` user's key works on the MCP endpoint; keys are stored hashed                                                                                                                      | plugin + `create-agent-key.ts`                                         |
| An MCP key is **not** a general login: it cannot read the REST API or the user list                                                                                                               | `src/access` (`roleOf`)                                                |
| Nothing is ever deleted by an agent; category slugs, contact emails, image files, users stay admin-only                                                                                           | `access/index.ts`, field access, `agentTextGuard`                      |
| No new or altered HTML embed or photo strip from an agent (script and layout are admin-only); existing ones stay byte for byte                                                                    | `restrictedBlockProblems`, all three content hooks                     |
| An edit names the version it read, and is refused if the document changed or is open in the admin                                                                                                 | `expected_updated_at` / `expected_version`, `overrideLock: false`      |
| Going live needs the kill switch on: a publish, and any save of Now, Uses, Resume or Site                                                                                                         | `agentBeforeChange`, `agentDocBeforeChange`, `agentGlobalBeforeChange` |
| **Every language that will be visible** passes the rules, not only the one requested                                                                                                              | `agentBeforeChange` (see below)                                        |
| Posts: title ≤ 120, description ≤ 160, body ≥ 600 chars (EN) / 300 (JA), category, cover alt text. Pages and projects: title ≤ 120, project summary ≤ 200, body ≥ 120 (EN) / 60 (JA), https links | `src/lib/agentPolicy.ts`                                               |
| No email, phone number, postal code, address marker or `PRIVACY_DENYLIST` term in what the agent adds (posts, pages, projects, settings, tags, alt text)                                          | `scripts/privacy-core.mjs` (the same detector as the CI scan)          |
| At most `AGENT_MAX_PUBLISHES_PER_DAY` go-live saves per 24 hours (default 6): posts, pages, projects and settings count together                                                                  | `agent-log` count                                                      |
| Every tool call, publish and refusal is recorded, with the collection and document                                                                                                                | `agent-log` collection (admin, MCP)                                    |
| Published slugs are permanent                                                                                                                                                                     | existing `lockSlugAfterPublish`                                        |
| The build still re-checks: locale rule, no drafts, privacy scan, embed isolation                                                                                                                  | `check-dist.mjs`, CI privacy scan                                      |

### Why "every visible language"

Payload keeps a published copy and a draft copy of a post, and **any save that is not a draft promotes the whole latest
draft, in every language**. A publish in English would therefore put an unreviewed Japanese edit live. So the gate
judges every language marked visible, and a single language cannot be taken down on its own. To publish only English
while Japanese is unfinished: `update_draft` with `language: ja, visible: false`, then `publish_post` for English.
`unpublish_post` takes the whole post offline. This was found by testing, not assumed, and is covered by
`scripts/check-agent-semantics.mjs`.

## Operate it

| Task                          | How                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stop publishing               | `AGENT_AUTO_PUBLISH=0`, restart the CMS. Drafts still work.                                                           |
| Revoke an agent               | Admin, **MCP > API keys**, delete the key (or delete the agent user).                                                 |
| Rotate a key                  | Create a new one with `pnpm cms:agent-key`, update the agent, delete the old one.                                     |
| See what an agent did         | Admin, **MCP > Agent log**: tool, outcome (ok / refused / error), collection, document id, language, reason.          |
| Undo a bad settings save      | Admin, **Globals > (Now, Uses, Resume, Site) > Versions**: restore one of the last 25.                                |
| Undo a bad edit to a post     | Admin, the post, **Versions**: restore (posts, pages and projects keep 25).                                           |
| Switch one tool off for a key | Admin, **MCP > API keys**, the tool checkboxes.                                                                       |
| Review before it goes live    | Leave auto-publish off: the agent's drafts wait in the admin under Posts, Pages and Projects for a person to publish. |

## After the site goes live: where the agent connects and what happens on publish

The public site is static files served by nginx; **it has no MCP endpoint and never will**. The agent talks to the CMS,
which is a separate application (Phase 4) at `https://cms.smkabir.com`, behind Cloudflare Access.

```text
Claude Code / Claude Desktop
        | MCP over HTTPS   (Authorization: Bearer <agent key>  +  CF-Access-Client-Id/Secret <service token>)
        v
Cloudflare Access  -- service-token policy -->  cms.smkabir.com/api/mcp   (Payload CMS, in the cluster)
                                                   |  rules, audit log, drafts, versions (Postgres)
                                                   |  publish -> hook -> GitHub repository_dispatch
                                                   v
GitHub Actions "content": pull from the CMS -> privacy scan -> build -> upload release to R2 -> move LATEST
                                                   v
nginx pods (content-sync polls LATEST every 60 s)  ->  smkabir.com shows the new post
```

| Step                        | Typical time     | If it fails                                                                                         |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| Agent calls `publish_post`  | seconds          | refused with reasons; nothing changes                                                               |
| Hook asks GitHub to rebuild | 20 s (debounced) | logged; the post is published in the CMS but the site is not rebuilt: re-run the `content` workflow |
| Build and upload            | 2 to 4 minutes   | the previous release keeps serving; the job is red                                                  |
| Pods pick up `LATEST`       | up to 60 s       | the previous release keeps serving                                                                  |

So a post is live roughly **3 to 6 minutes** after the agent publishes. If the CMS is down the **site stays up**
(it is static); only writing stops. If the site's pods are down the CMS and the agent still work.

Connecting from your laptop to the production CMS (illustrative; use the same bridge, no client change):

```sh
# Claude Code, direct HTTP:
claude mcp add --transport http kabir-blog-live https://cms.smkabir.com/api/mcp \
  --header "Authorization: Bearer <agent key>" \
  --header "CF-Access-Client-Id: <id>" --header "CF-Access-Client-Secret: <secret>"
# Claude Desktop (stdio bridge reading these from its environment; the bridge sends the three headers):
#   env: { "MCP_URL": "https://cms.smkabir.com/api/mcp", "MCP_KEY": "...", "CF_ACCESS_CLIENT_ID": "...", "CF_ACCESS_CLIENT_SECRET": "..." }
```

Run the local and the live server side by side under different names (`kabir-blog` and `kabir-blog-live`) so a draft
never goes to the wrong place.

## Before pointing a remote agent at the live CMS (Phase 4 checklist, illustrative)

1. CMS deployed behind Cloudflare Access; the agent connects with an Access **service token** header plus its MCP key.
2. `AGENT_AUTO_PUBLISH`, `AGENT_MAX_PUBLISHES_PER_DAY`, `PRIVACY_DENYLIST` set in the CMS environment.
3. `GITHUB_DISPATCH_TOKEN` (fine-grained, this repo only, Contents read/write) so a publish rebuilds the site, and the
   repository variable `CMS_URL` plus `PAYLOAD_BUILDER_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` so
   `content.yml` builds from the CMS (docs/secrets.md).
4. The failover Worker (Phase 9) serves `/embeds/*` with the embed header set (docs/cms.md).
5. Next.js needs `outputFileTracingRoot` at the repo root when the CMS image is built, because the policy imports
   `scripts/privacy-core.mjs`.

## What this does not protect against

- **A persuasive but wrong or off-brand post.** The rules catch private data, missing fields and format problems, not
  judgement. Auto-publish trades review for speed; the daily limit and the audit log bound the damage, the kill switch
  stops it.
- **Prompt injection.** An agent that reads web pages can be steered into writing something. Keep auto-publish off for
  an agent that browses, or give it only trusted sources.
- **Machine-written Japanese quality.** The gate checks form, not language. A native read before a Japanese post goes
  live is worth it while you are building trust.
