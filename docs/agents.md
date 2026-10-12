# Letting an AI agent write and publish posts

An AI agent (Claude Code, Claude Desktop, any MCP client) can write posts in **English and Japanese** and publish them
through the CMS's MCP endpoint. It writes Markdown; the CMS turns it into the same structured content the site
renders, applies the publishing rules **inside the CMS**, and records everything it does.

Snippets are marked **production-ready** or **illustrative**.

## Status

| Part                                    | Works today                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Tools, rules, audit log, kill switch    | Yes, against the local CMS (28 + 22 + 14 end-to-end checks)                    |
| Agent-published posts build on the site | Yes: pulled and built, every dist gate passes                                  |
| Remote agent against the live CMS       | After Phase 4 (CMS in the cluster, behind Cloudflare Access)                   |
| Publishing triggers a site rebuild      | Hook is built; needs `GITHUB_DISPATCH_TOKEN` and Phase 4 for CI to see the CMS |

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

**Publishing is off until you turn it on.** With `AGENT_AUTO_PUBLISH` unset or not exactly `1` the agent can write and
check drafts, and `publish_post` is refused with an explanation. Set `AGENT_AUTO_PUBLISH=1` in the CMS environment and
restart it to allow publishing. Setting it back to `0` is the kill switch.

## The tools

| Tool             | What it does                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `site_guide`     | The rules, limits, categories, existing tags and the Markdown dialect. Always first.                                          |
| `list_posts`     | Existing posts (id, slug, status, titles, which languages are visible).                                                       |
| `get_post`       | One post in both languages as Markdown. Blocks Markdown cannot express appear as `[[keep:id]]`.                               |
| `create_draft`   | New post, one language, saved as a **draft**.                                                                                 |
| `update_draft`   | Change one language of a post the agent created, or add a language. `visible: false` hides a language.                        |
| `upload_image`   | JPEG/PNG/WebP/AVIF up to 8 MB (base64 or an allow-listed https host). Metadata stripped. Alt text in both languages required. |
| `check_post`     | Dry run of the publish rules for one language. Changes nothing.                                                               |
| `publish_post`   | Publish one or both languages. Refused, with reasons, if any visible language breaks a rule.                                  |
| `unpublish_post` | Take the whole post offline (back to draft). Never blocked.                                                                   |

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

| Rule                                                                                       | Where                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Only an `agent` user's key works on the MCP endpoint; keys are stored hashed               | plugin + `create-agent-key.ts`                                |
| An MCP key is **not** a general login: it cannot read the REST API or the user list        | `src/access` (`roleOf`)                                       |
| The agent changes only posts it created itself; never anyone else's; never deletes         | `postAccess`, `agentBeforeChange`                             |
| No HTML embeds or photo strips from an agent (script and layout are admin-only)            | `agentBeforeChange`                                           |
| Publishing needs the kill switch on                                                        | `agentBeforeChange`                                           |
| **Every language that will be visible** passes the rules, not only the one requested       | `agentBeforeChange` (see below)                               |
| Title ≤ 120, description ≤ 160, body ≥ 600 chars (EN) / 300 (JA), category, cover alt text | `src/lib/agentPolicy.ts`                                      |
| No email, phone number, postal code, address marker or `PRIVACY_DENYLIST` term in the text | `scripts/privacy-core.mjs` (the same detector as the CI scan) |
| At most `AGENT_MAX_PUBLISHES_PER_DAY` publishes per 24 hours (default 6)                   | `agent-log` count                                             |
| Every tool call, publish and refusal is recorded                                           | `agent-log` collection (admin, MCP)                           |
| Published slugs are permanent                                                              | existing `lockSlugAfterPublish`                               |
| The build still re-checks: locale rule, no drafts, privacy scan, embed isolation           | `check-dist.mjs`, CI privacy scan                             |

### Why "every visible language"

Payload keeps a published copy and a draft copy of a post, and **any save that is not a draft promotes the whole latest
draft, in every language**. A publish in English would therefore put an unreviewed Japanese edit live. So the gate
judges every language marked visible, and a single language cannot be taken down on its own. To publish only English
while Japanese is unfinished: `update_draft` with `language: ja, visible: false`, then `publish_post` for English.
`unpublish_post` takes the whole post offline. This was found by testing, not assumed, and is covered by
`scripts/check-agent-semantics.mjs`.

## Operate it

| Task                          | How                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Stop publishing               | `AGENT_AUTO_PUBLISH=0`, restart the CMS. Drafts still work.                                       |
| Revoke an agent               | Admin, **MCP > API keys**, delete the key (or delete the agent user).                             |
| Rotate a key                  | Create a new one with `pnpm cms:agent-key`, update the agent, delete the old one.                 |
| See what an agent did         | Admin, **MCP > Agent log**: tool, outcome (ok / refused / error), language, post id, reason.      |
| Switch one tool off for a key | Admin, **MCP > API keys**, the tool checkboxes.                                                   |
| Review before it goes live    | Leave auto-publish off: the agent's drafts wait in the admin under Posts for a person to publish. |

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
