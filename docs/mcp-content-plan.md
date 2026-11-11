# smkabir.com: move live content to Payload and give MCP full content control

## Status (as built, 2026-11-02)

Phases 1 to 4 are implemented and verified locally; phase 5 (go-live) needs your hands and is written up in
[cutover.md](cutover.md). Nothing is committed, tagged, pushed or deployed.

| Phase                    | State                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Test environment       | Done. Scratch databases on `pg-stg` (no local Postgres), dropped afterwards.                                                                                                                      |
| 2 Cutover tooling        | Done and rehearsed: `pnpm cms:import`, and a site built from the imported CMS has the same 63 pages and sitemap as the fixture build. The switch itself is yours (Access token, keys, `CMS_URL`). |
| 3 Permissions and guards | Done. Migration `20261101_145841_mcp_full_content` applies, rolls back and re-applies.                                                                                                            |
| 4 Tools                  | Done: 32 tools (23 new). 83 unit tests, `cms:check-scope` 71 + 12, `cms:check-hooks` 20, `cms:check-agent` 28 + 22, publish semantics 14, bridge 3 + 4.                                           |
| 5 Go-live                | Not started: restore proof, release `v0.3.0`, image bump, Access token, keys, import, `CMS_URL`, agent key, `AGENT_AUTO_PUBLISH`.                                                                 |

**Where the build differs from the plan below**

- Settings use `expected_version` (a fingerprint of their content), not `expected_updated_at`. Testing showed Payload does
  not move a global's `updatedAt` when only language-specific fields change, and writes the saved version's timestamp after
  the save returns, so a timestamp could not detect a person's edit to Now or the Uses text.
- Tags, category names and image details have no stale-edit check (low stakes, no draft stage); posts, pages, projects and
  the four settings do.
- The importer uploads an image only when a document that needs it is being created, because the CMS renames an upload whose
  file name is taken, so names cannot be matched on a rerun. Its switches are environment variables (`IMPORT_APPLY=1`,
  `IMPORT_ALLOW_REMOTE=1`, `IMPORT_FORCE_GLOBALS=1`) because `payload run` hands a script flags only after a second `--`.
- Embed and photo-strip blocks are compared by id and by the values they carry (Payload adds defaults such as `height`
  on save), not by exact JSON.
- Testing the Markdown round trip over the fixtures found two bugs that would have corrupted a person's text on any agent
  edit (`**word **` and `**a****b**`); both are fixed (CHANGELOG, "Fixed").
- A link that was already in a document is never the agent's problem, and an internal path (`/projects/x/`) is a valid
  link; the plan said "https only".

## Context

**Yes, it is possible, and most of it already exists.** `Kabir-Blog/kabir-blog` has Payload 3.90.2 deployed at
`cms.smkabir.com` on shared CNPG with R2 media, an Astro site that can build from it, and an MCP endpoint at `/api/mcp`.
All work happens in that repo plus `homelab-terraform`. AiBuddy is not touched.

Two gaps remain:

1. **The live site does not use Payload yet.** On 2026-11-01 the home page still contained the sample/fixture banner
   text. `kabir-blog` has no GitHub variables or secrets, so `content.yml` builds from
   `apps/site/src/content/fixtures/`. Posts are edited as fixture commits.
2. **MCP is limited.** It has 9 post-only tools, can change only posts it created, and has no tools for pages,
   projects, tag/category/media edits or globals. `AGENT_AUTO_PUBLISH` is `0` in production.

Prerequisites that are also missing: the Cloudflare Access service token and Service Auth policy, the sealed
`cms-github` secret, a production agent user and key, and a proven backup restore.

**Decisions**

- The agent publishes directly, behind gates.
- MCP scope is all posts, pages, projects, tags, category names, media metadata and the Now, Uses, Resume and Site
  globals.
- Locales stay EN+JA. Bengali is out of scope.
- Delete stays admin-only.
- Contact email (`site.email`, `resume.basics.email`) stays admin-only.
- Category slugs stay closed, because a new category also needs a site change.
- Image files cannot be replaced by the agent; it edits metadata and uploads new images.

## Phase 1: Test environment

Follow the global rule: no local database for this work.

- Run the local CMS against a private `pg-stg` database, `kb_test_mcp`, over port-forward 25432. Set `DATABASE_URL` in
  the shell only. Read credentials at run time. Drop the database when done.
- The seed and `agent-key` scripts accept it because the host is `127.0.0.1`.
- If a local `smkabir-postgres` container exists, follow the global migrate-verify-remove procedure.
- Work on a new branch. Leave the existing uncommitted `docs/deploy.md` change out of these commits.
- Repo rule: verify each Payload API against current docs before using it, especially `overrideLock` and global
  `versions`, and record pins in `docs/versions.md`.

## Phase 2: Content cutover (fixtures to production Payload)

This can ship before any MCP change. `seed.ts` refuses non-local databases by design, so it stays dev-only.

**Prerequisites (Cloudflare, GitHub, GitOps)**

- Create the Access service token and add a Service Auth policy to the `cms` application.
- Create the read-only builder user and key in the admin.
- Set GitHub secrets `PAYLOAD_BUILDER_KEY`, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
- Seal `cms-github` (`seal-cms-extras.sh`) with a fine-grained dispatch token and bump the `secrets-rev` annotation in
  `prod/apps/cms/cms.yaml`.
- Set `CMS_URL` **last**. It is the actual switch.

**Importer: new `apps/cms/scripts/import-fixtures.mjs`**

- Runs over REST from the Mac with an admin API key and the service token. Values come from the environment, never
  argv or files.
- Reuses the Lexical media-rewrite and SVG-rasterise logic from `src/scripts/seed.ts` (extract shared helpers rather
  than copying).
- Imports media, categories, tags, posts, projects, pages and globals, in both locales, keeping slugs and `pubDate`.
- Idempotent: an existing slug is skipped and reported, never overwritten. `--dry-run` prints the plan.
- Skips `posts/unfinished-draft.json`.
- Posts stay `createdByAgent: false`.

**Cutover gate**

1. Import, then run `pnpm cms:check-privacy`.
2. Build once with `SITE_CONTENT=cms` from a pull, without changing `LATEST`.
3. Compare the route list and `hreflang` set against the current fixture build. Published URLs must match exactly, and
   `check-dist.mjs` must pass.
4. Set `CMS_URL` and run `content.yml`.
5. Confirm the sample banner is gone and that a test publish in the admin triggers a rebuild, proving the dispatch.

Rollback is to unset `CMS_URL` and re-run the workflow, or point `LATEST` back at the previous release.

**Docs:** `README.md`, `docs/cms.md` and `CLAUDE.md` must say Payload is now the source of truth and fixtures are
test data only.

## Phase 3: MCP permissions and guards

Repo rule: limits live in CMS hooks and access rules, not only in tools.

**Access (`src/access/index.ts`, collections, globals)**

| Data                       | Agent can                               | Stays admin-only                    |
| -------------------------- | --------------------------------------- | ----------------------------------- |
| Posts                      | Create, update all                      | Delete                              |
| Pages, Projects            | Create, update                          | Delete                              |
| Tags                       | Create, update                          | Delete                              |
| Categories                 | Update `name`                           | Slug (field access), create, delete |
| Media                      | Create, update `alt`/`caption`/`credit` | File replacement, delete            |
| Now, Uses, Resume          | Update                                  | `resume.basics.email`               |
| Site                       | Update                                  | `email`                             |
| Users, API keys, agent-log | Nothing                                 | Everything                          |

**Guards (generalise `src/hooks/agentGuards.ts`)**

- Remove the "own posts only" refusal, and stop forcing `createdByAgent = true` on update (line 71). The flag now
  records who created a post rather than granting permission.
- **Embeds and photo strips:** the current check refuses any save containing one, which would block editing your posts.
  Change it to compare block IDs against the stored document: existing blocks pass, new ones are refused. Update the
  matching check in `publishProblems` the same way.
- **Stale-edit protection:** editing or publishing an existing document requires `expected_updated_at`, and a mismatch
  is refused. Also pass `overrideLock: false` so the agent cannot overwrite a document open in the admin, whose
  autosave runs every 2 seconds.
- **Unreviewed draft promotion:** a publish promotes the latest draft in every language. Rule checks already run on
  every visible language, and `expected_updated_at` stops a human edit made after the agent's read from going live.
- **Publish gate for pages and projects:** apply the same kill switch, privacy scan, daily limit and audit logging.
  Add per-type rules to `src/lib/agentPolicy.ts`; the 600/300 character post minimum does not suit an About page.
- **Globals (new `agentBeforeGlobalChange`):** these have no draft stage, so every save counts as a publish. The kill
  switch applies, and each save counts toward the daily limit.
- **Privacy scan:** scan only the text the agent submitted, so the existing public contact address does not refuse
  every Resume and Site save.
- **Link safety:** project and resume links must be `https://`. `site.socials` URLs must match a host allow-list, since
  they appear on every page. `nav` is already a closed list.
- **Audit:** add a `collection` text field to `agent-log`, and log the real target ID and language from `define()`,
  which currently logs only the tool name.

**Schema (committed migrations)**

- Add `versions: { max: 25 }` to the four globals so a bad save can be restored in the admin.
- Add `agent-log.collection`.
- Add one `payload_mcp_tool_*` column per new tool. The plugin makes one per custom tool, defaulting to `true`, so
  existing keys get new tools automatically. Existing tool names must not change.
- Generate migrations with the `S3_*` variables both set and unset and compare them, as `CHANGELOG.md` requires. Test
  apply, rollback and re-apply.

## Phase 4: MCP tools

Split `src/mcp/tools.ts` into `src/mcp/{define,posts,pages,projects,taxonomy,media,globals}.ts`, keeping the `agentTools`
export and the existing `define()` wrapper, `as(ctx)` and Markdown conversion.

| Area               | Tools                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posts (existing 9) | `update_draft` also takes `category`, `hero`, `series`, `toc`, `pubDate`, `updatedDate` and `expected_updated_at`. `publish_post` also takes `expected_updated_at`. Descriptions and `site_guide` are rewritten for the new scope. |
| Pages              | `list_pages`, `get_page`, `save_page`, `publish_page`, `unpublish_page`                                                                                                                                                            |
| Projects           | `list_projects`, `get_project`, `save_project`, `publish_project`, `unpublish_project`                                                                                                                                             |
| Taxonomy           | `list_tags`, `update_tag`, `list_categories`, `update_category_name`                                                                                                                                                               |
| Media              | `list_media`, `update_media`                                                                                                                                                                                                       |
| Globals            | `get_global`, `update_now`, `update_uses`, `update_resume`, `update_site`                                                                                                                                                          |

- Each document `get_*` returns `updatedAt` to use as `expected_updated_at`.
- Rich text stays Markdown, with `[[keep:id]]` for blocks Markdown cannot express.
- `update_uses` and `update_resume` take the full typed structure and validate it with zod before saving, so a partial
  array cannot silently delete entries.
- No delete tools and no generic collection tools (`collections: {}` stays).
- Resume and Site can be switched off for a key using the existing tool checkboxes under **MCP > API keys**, so no
  second kill switch is added.

## Phase 5: Release and go-live

Order matters. Each step goes through the repo's normal path.

1. Write the `CHANGELOG.md` entry and update `docs/agents.md` and `docs/cms.md`. Tag `v0.3.0`.
2. Commit the image bump in `homelab-terraform/prod/apps/cms/cms.yaml` with `AGENT_AUTO_PUBLISH` still `0`. Add
   `PRIVACY_DENYLIST` as a SealedSecret value. Confirm the migrations apply and `/readyz` returns 200.
3. **Prove a `pg-main` restore.** `docs/deploy.md` lists this as not yet proven, and Postgres is about to become the
   only copy of the content. Restore to a temporary CNPG cluster, not `pg-stg`, which must never hold production data.
4. In the admin, create the agent user and key, because the container has no `payload` CLI.
5. Connect `kabir-blog-live` using `mcp-stdio-bridge.mjs`, with secrets read from the environment and not written to
   client config.
6. Test with drafts only (below), then commit `AGENT_AUTO_PUBLISH: '1'`.

## Verification

**Automated, local CMS on `pg-stg`**

- `pnpm --filter @smkabir/cms typecheck`, `pnpm test`, `pnpm privacy`, `pnpm format:check` and `pnpm build`.
- **Markdown round trip:** for every fixture post, page and project, `markdownFromLexical` followed by
  `markdownToLexical` keeps content and blocks. This protects your content when the agent edits it.
- **Unit tests:** embed block-ID comparison, per-type policies, submitted-text privacy scan, social host allow-list.
- **Extend `check-agent.mjs` and `check-agent-semantics.mjs` over real MCP.** Each must pass:
  - edit and publish a human-written post, with its existing embed preserved
  - refuse a newly added embed, in both tool calls and direct REST with the agent's key
  - refuse a stale `expected_updated_at` and a document locked in the admin
  - refuse delete everywhere, plus category slug, contact email and non-allow-listed social links
  - refuse all publishes and global saves with the kill switch off; `unpublish_*` still works
  - the daily limit counts posts, pages, projects and globals together
  - every call and refusal appears in `agent-log`
  - an old key can use the new tools

**End to end in production**

- With the kill switch off: the agent drafts a test post in both languages and edits a page draft. Nothing changes on
  the public site.
- With the kill switch on: publish one real post, edit one project, and update Now. Each should appear on
  `smkabir.com` within about 6 minutes, with `/ja/` correct and a matching `agent-log` entry. Then unpublish the test
  post and confirm its removal after the next rebuild.

## Risks that remain

- **Wrong or prompt-injected content:** with direct publishing the gates check form and privacy, not judgement. Now that
  scope includes Site and Resume, an agent that browses the web should use a key with `update_site`, `update_resume` and
  the publish tools unticked.
- **Unpublish is never blocked:** the agent can take down any post or page, including yours. It is audited and reversible.
- **Globals go live on save:** version history allows a restore, but there is no pre-publish review.
- **Editing content after cutover:** fixture edits no longer change the live site, so the workflow for posts changes
  from Git commits to the admin or MCP.
