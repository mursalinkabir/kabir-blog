# Cutover: smkabir.com is served by the CMS app, and the agent can edit it

Until this is done the live site is the Astro site built from the committed sample content in
`apps/site/src/content/fixtures/` (nginx pods that read releases from R2). After it, **one app serves everything**: the
Payload app (`kabir-blog-cms`) answers `smkabir.com` with the public pages and `cms.smkabir.com` with the admin, the API,
the MCP endpoint and previews. A publish is live within about a second, with no build step. Design:
`docs/superpowers/specs/2026-11-11-single-app-blog-design.md`. Snippets are **production-ready** unless marked
illustrative.

## What has been proven, and what has not

| Step                                                                                  | Proven                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Every page, feed and the sitemap match the Astro build of the same content            | Yes, in CI and locally (`PARITY_DIST=apps/site/dist pnpm --filter @smkabir/cms test`): 77 pages, 5 feeds, sitemap  |
| An edit or an unpublish shows on the public pages within two seconds                  | Yes, against a seeded staging database: 916 ms and 616 ms                                                          |
| `smkabir.com` serves pages only; `/admin`, `/api`, `/preview` answer 404              | Yes, in the image smoke test (also host case, port and trailing-dot variants)                                      |
| Agent scope, kill switch, hooks, stale-edit and lock protection                       | Yes: `check:scope` 71, `check:hooks` 20, `check:agent` 28, semantics 14                                            |
| Migration `20261101_145841_mcp_full_content`, importer, restore of a `pg-main` backup | The migration and importer: 2026-11-02 against `pg-stg`. **The restore is not proven: it is step 1.**              |
| The CMS image in the cluster (memory, `d2` under PodSecurity `restricted`)            | **No.** Check `kubectl -n cms top pod` after step 3 and raise the request in `cms.yaml` if the pod is near 512 MiB |

## Steps (you do these: they use Cloudflare, GitHub and the cluster repository)

1. **Prove a restore.** After this, Postgres holds the only copy of the content. Restore the latest `pg-main` backup into a
   throwaway CNPG cluster (not `pg-stg`, which must never hold production data) and start a scratch Payload on it
   (`docs/deploy.md`, "pg-main backups"). Do not continue until that works. _Undo: nothing changed yet._
2. **Release the code.** `CHANGELOG.md` has the 0.3.0 entry. Push `main`, then the tag `v0.3.5`; wait for the `release`
   workflow (`gh run list --workflow release --limit 1`) to be green and the image to exist on GHCR. The workflow runs the
   unit tests, the parity test against the Astro build, the image smoke test and the vulnerability scan. If the scan flags
   the `d2` binary, stop: an exception is your decision, not an automatic one. _Undo: nothing is deployed by a tag._
3. **Deploy the new CMS image without exposing the site.** In `homelab-terraform/prod/apps/cms/`, copy the new
   `cms.yaml` from `deploy/homelab-terraform/prod/apps/cms/cms.yaml` **without** the `cms-public` HTTPRoute at the bottom
   (it is step 9), and bump the image to `0.3.5`. The migration applies when the first `/readyz` probe connects. Leave
   `AGENT_AUTO_PUBLISH: '0'`. Delete the old `cms-github` SealedSecret file if you made one and revoke its token. Commit by
   explicit path, push, wait for Argo CD (about 3 minutes). Check: the pod is Ready, `cms.smkabir.com/admin` still asks for
   Access, `kubectl -n cms top pod` shows the memory it uses. _Undo: `git revert` the commit; the migration only adds tables
   and columns, so the old image still runs._
4. **Cloudflare Access service token.** Create a service token and add a Service Auth policy to the `cms` Access application.
   The importer and the agent bridge send `CF-Access-Client-Id` and `CF-Access-Client-Secret`. The apex `smkabir.com` is
   **not** behind Access and never gets an Access application. _Undo: delete the token._
5. **An importer user in the admin** (Users, open the user, tick _Enable API key_): an **admin** user such as
   `importer@…`; untick the key when the import is done. No reader or "builder" key is needed any more.
6. **Import** (illustrative values; secrets come from your shell or a secret manager, never from a file in the repo):

   ```sh
   export IMPORT_URL=https://cms.smkabir.com IMPORT_ALLOW_REMOTE=1
   export IMPORT_API_KEY=...  CF_ACCESS_CLIENT_ID=...  CF_ACCESS_CLIENT_SECRET=...
   npx pnpm@12.9.1 cms:import                 # dry run: lists what it would create
   IMPORT_APPLY=1 npx pnpm@12.9.1 cms:import  # writes; running it again changes nothing
   ```

   Existing slugs are skipped, never overwritten. A site-wide setting that already has content is left alone
   (`IMPORT_FORCE_GLOBALS=1` overwrites). The unfinished draft post stays a draft. Compare the counts with the dry run
   (12 posts today; projects, pages, tags, categories, images) and look at them in the admin: both languages on a post, the
   images, Site / Now / Uses / Resume. _Undo: the import only adds; delete what you do not want in the admin._

7. **Check the media from outside**, because the public pages print the media URLs as Payload returns them:

   ```sh
   curl -sI "$MEDIA_PUBLIC_URL/<one file name from the admin>" | head -1     # must be 200, and no Access prompt
   ```

   If it is not 200, stop: the pages would show broken images.

8. **Check the new site before it is public.** Reach the pod directly and ask for the public hostname:

   ```sh
   kubectl -n cms port-forward svc/cms 3100:80 &
   curl -s -H 'Host: smkabir.com' localhost:3100/version.json     # skipped_documents must be 0
   curl -s -H 'Host: smkabir.com' localhost:3100/sitemap-0.xml | grep -o '<loc>[^<]*' | sort > /tmp/new-urls.txt
   curl -s https://smkabir.com/sitemap-0.xml                      | grep -o '<loc>[^<]*' | sort > /tmp/old-urls.txt
   diff /tmp/old-urls.txt /tmp/new-urls.txt && echo "same pages"
   ```

   Open a post in each language, `/rss.xml`, `/ja/rss.xml` and `/search/?q=homelab` the same way. A page that differs here
   is a reason to stop. _Undo: stop the port-forward._

9. **Switch.** One commit in `homelab-terraform`: add the `cms-public` HTTPRoute from the draft to `prod/apps/cms/cms.yaml`
   and remove the `blog` HTTPRoute from `prod/apps/blog/blog.yaml` (a hostname has one route). Check first that the `public`
   Gateway's `https-apex` listener admits the `cms` namespace, as it admits `blog` today. Check after: `https://smkabir.com/version.json`
   has `content_version`, the home page has no sample banner, then purge the Cloudflare cache. _Undo (one command):
   `git revert` that commit. The old pods and the R2 release are untouched and take the hostname back._
10. **Connect the agent.** In the admin create a user with role _Agent_, then **MCP > API keys** for it (the container has no
    `payload` CLI, so `cms:agent-key` is local only). Add it as `kabir-blog-live` (`docs/agents.md`, "After the site goes
    live"). First test with drafts only: it should draft a post in both languages and edit a page draft, and nothing should
    change on the public site.
11. **Let it publish (your decision).** A publish is public within a second, so `AGENT_AUTO_PUBLISH: '1'` lets the agent change
    the site without a person reading it first. Set it in `cms.yaml` and set `PRIVACY_DENYLIST` in the CMS environment.
    Publish one real post, edit one project and update Now; each should be live at once with a matching entry in
    **MCP > Agent log**. Setting the value back to `'0'` is the kill switch.
12. **A week later, if all is well:** the old stack can go (Task 15 in the plan: `apps/site`, `apps/server`, the content
    workflows, the R2 `releases/` prefix and the blog Deployment). Do not do it sooner: until then step 9's revert is a full
    rollback.

## After the cutover

- Editing a fixture no longer changes the live site. New posts are written in the admin or by the agent.
- Everything goes live the moment it is saved or published: posts, pages, projects, tags, categories, images and the four
  settings. Unpublishing takes a page down at once too.
- `https://smkabir.com/version.json` is the health view: `content_version`, `loaded_at`, `stale` (true while a reload is
  failing and the last good copy is being served) and `skipped_documents` (documents that could not be read; the log lines
  start with `[site] skipped:`).
- A browsing agent can be steered by what it reads. Give such an agent a key with `update_site`, `update_resume`,
  `update_uses`, `update_now` and the `publish_*` tools unticked, or keep `AGENT_AUTO_PUBLISH` at `0` for it.
- URLs under `/_astro/` and `/pagefind/` stop resolving; `/images/` and `/fixtures/` keep working.
