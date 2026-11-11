# Cutover: smkabir.com reads its content from Payload, and the agent can edit it

Until this is done the live site is built from the committed sample content in `apps/site/src/content/fixtures/`
(`content.yml` has no `CMS_URL`, so it builds the fixtures and the page carries the sample banner). After it, **Payload is
the source of truth**: a post is written in the admin or by the agent, a publish rebuilds the site, and the fixtures are
test data only. Snippets are **production-ready** unless marked illustrative.

What was proven on 2026-11-02 against a scratch Postgres (`pg-stg`), and what was not:

| Step                                                                                                                                                                                          | Proven locally                                                                          | Still to prove in production            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| Migration `20261101_145841_mcp_full_content` applies, rolls back, re-applies (generated with the `S3_*` variables set; the variant without them differs only by a `DROP COLUMN "_objectkey"`) | yes                                                                                     | first start of the new image            |
| Importer: dry run, apply, apply again changes nothing; counts match the fixtures (10 posts, 2 projects, 1 page, 13 tags, 3 categories, 12 images)                                             | yes                                                                                     | against `cms.smkabir.com` behind Access |
| Site built from the imported CMS has the same 63 pages and the same sitemap as the fixture build; every dist gate passes                                                                      | yes                                                                                     | the real `content.yml` run              |
| Agent scope, kill switch, hooks, stale-edit and lock protection                                                                                                                               | yes (`cms:check-scope` 71 + 12, `cms:check-hooks` 20, `cms:check-agent`, 83 unit tests) | a remote agent through Access           |
| Restore of a `pg-main` backup                                                                                                                                                                 | no                                                                                      | **do this first (step 1)**              |

## Steps (you do these: they use Cloudflare, GitHub and the cluster repository)

1. **Prove a restore.** After this, Postgres holds the only copy of the content. Restore the latest `pg-main` backup into a
   throwaway CNPG cluster (not `pg-stg`, which must never hold production data) and start a scratch Payload on it
   (`docs/deploy.md`, "pg-main backups"). Do not continue until that works.
2. **Release the code.** `CHANGELOG.md` already has the 0.3.0 entry. Push the tag `v0.3.0` (the image is built by the
   release workflow), then make the one-line `image:` bump in `homelab-terraform/prod/apps/cms/cms.yaml`. The migration
   applies when the first `/readyz` probe connects. Leave `AGENT_AUTO_PUBLISH: '0'` for now. Rollback: `git revert` the bump
   (the migration only adds tables and columns, so the old image still runs).
3. **Cloudflare Access service token.** Create a service token and add a Service Auth policy to the `cms` Access
   application. The importer, the site build and the agent bridge all send `CF-Access-Client-Id` and
   `CF-Access-Client-Secret`.
4. **Two keys in the admin** (Users, open the user, tick _Enable API key_):
   - an **admin** user for the import (use a separate user such as `importer@…`, and untick the key when done);
   - a **reader** user `builder@…` for the site build (`PAYLOAD_BUILDER_KEY`).
5. **Import** (illustrative values; secrets come from your shell or a secret manager, never from a file in the repo):

   ```sh
   export IMPORT_URL=https://cms.smkabir.com IMPORT_ALLOW_REMOTE=1
   export IMPORT_API_KEY=...  CF_ACCESS_CLIENT_ID=...  CF_ACCESS_CLIENT_SECRET=...
   npx pnpm@12.9.1 cms:import                 # dry run: lists what it would create
   IMPORT_APPLY=1 npx pnpm@12.9.1 cms:import  # writes; running it again changes nothing
   ```

   Existing slugs are skipped, never overwritten. A site-wide setting that already has content is left alone
   (`IMPORT_FORCE_GLOBALS=1` overwrites). The unfinished draft post stays a draft. A publish during the import schedules one
   debounced site rebuild; until `CMS_URL` is set (step 8) that rebuild still uses the fixtures, which is harmless.

6. **Check it in the admin**: counts, both languages on a post, the images, Site / Now / Uses / Resume.
7. **Rehearse the build without switching anything:**

   ```sh
   cd apps/site
   CMS_URL=https://cms.smkabir.com CMS_API_KEY=... CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... node scripts/pull-cms.mjs
   SITE_CONTENT=cms npx pnpm@12.9.1 build     # dist gates and the privacy scan must pass
   (cd dist && find . -name '*.html' | sort) > /tmp/routes-cms.txt   # compare with a SITE_CONTENT=fixtures build: it must match
   rm -rf src/content/cms public/media         # the pulled content is git-ignored, but it changes what a local dev server shows
   ```

8. **Switch.** Add the repository secrets `PAYLOAD_BUILDER_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, seal
   `cms-github` (`GITHUB_DISPATCH_TOKEN`, `deploy/homelab-terraform/seal-cms-extras.sh`) and bump `secrets-rev` in
   `cms.yaml`, then set the repository variable **`CMS_URL=https://cms.smkabir.com` last** and run the `content` workflow.
   Check: the sample banner is gone, `smkabir.com/version.json` has a new `build_id`, and a publish in the admin rebuilds
   the site within a few minutes (the dispatch has not been proven in production yet). Rollback: unset `CMS_URL` and
   re-run `content`, or point `LATEST` in R2 back at the previous release.
9. **Connect the agent.** In the admin create a user with role _Agent_, then **MCP > API keys** for it (the container has
   no `payload` CLI, so `cms:agent-key` is local only). Add it as `kabir-blog-live` (`docs/agents.md`, "After the site goes
   live"). First test with drafts only: it should draft a post in both languages and edit a page draft, and nothing
   should change on the public site.
10. **Let it publish.** Set `AGENT_AUTO_PUBLISH: '1'` in `cms.yaml` (a commit in `homelab-terraform`), and set
    `PRIVACY_DENYLIST` in the CMS environment. Publish one real post, edit one project and update Now; each should be live
    within about 6 minutes with a matching entry in **MCP > Agent log**. Setting the value back to `'0'` is the kill switch.

## After the cutover

- Editing a fixture no longer changes the live site. New posts are written in the admin or by the agent.
- Settings (Now, Uses, Resume, Site) go live the moment they are saved; the last 25 versions are kept in the admin.
- A browsing agent can be steered by what it reads. Give such an agent a key with `update_site`, `update_resume`,
  `update_uses`, `update_now` and the `publish_*` tools unticked, or keep `AGENT_AUTO_PUBLISH` at `0` for it.
