# Single-app blog: design

Date: 2026-11-11. Status: waiting for the owner's review. Plan: `docs/superpowers/plans/2026-11-11-single-app-blog.md`.

## Why

Publishing today takes a chain of nine moving parts: CMS publish, a debounced GitHub dispatch, a workflow, a pull
of the CMS, an Astro build, an upload to R2, a pointer file, a sidecar that swaps a symlink, and a verify step. It
takes minutes, and the switch to CMS content was never finished, so the live site still builds from JSON files in
Git. The owner's words: the current setup is "a bit complex", and the thing wanted most is "I click publish and
it's live in a second, with no build step", with the whole site reachable by an AI agent over MCP.

## What the owner decided

- Publish must be live in about a second, with no build step.
- PostgreSQL stays the database.
- An AI agent must be able to post and edit on the owner's behalf through MCP.
- The existing posts are kept (12 posts, most in English and Japanese).
- High availability does not matter: the home servers have good uptime, and a minute of downtime on a deploy is fine.
- The implementation will be done by a Sonnet session, from a written plan.
- A fresh start on another project was acceptable if clearly better.

## What I decided (my calls, open to change)

1. **Keep Payload, drop everything after it.** I compared Ghost, Strapi, Directus, WordPress and Payload. Only
   Payload already holds this site's content model, both languages, the Cloudflare Access check and a tested MCP
   agent with 32 tools and guard rails. Starting again would mean rebuilding those and migrating the posts for no
   gain. What makes today's setup complex is the static pipeline, and that is the part that goes.
2. **The Payload app serves the public site itself.** One Next.js catch-all route handler in `apps/cms` reads the
   content through Payload's Local API and returns HTML. No Astro build, no R2 site releases, no nginx, no sidecar,
   no content workflows.
3. **Pages are React server components in the Payload app** (owner's choice, 2026-11-11; I first proposed string templates). Next supplies routing, metadata and the 404. The page policy changes from "no inline scripts" to "only scripts with a per-request nonce", never `unsafe-inline`; readers download the React runtime. The existing stylesheet applies unchanged and the new output is compared with the Astro output by the parity test (text, links, headings, meta, classes).
4. **Content is held in memory and refreshed on every change.** A snapshot of the whole site (a dozen posts) is
   loaded once, reused for every request, and thrown away by a hook on every save, publish or delete. This is
   valid because the app runs as one replica.
5. **One pod, two hostnames.** `smkabir.com` serves the public pages and answers 404 for `/admin`, `/api` and
   `/preview`. `cms.smkabir.com` keeps the Cloudflare Access check for everything, as now. An unknown hostname is
   treated like the CMS hostname, so a mistake fails closed.
6. **Search runs on the server** (`/search/?q=`), replacing Pagefind, whose index was built at build time.
7. **Diagrams keep using the `d2` program**, now installed in the CMS image and run on first view, with the
   result cached. The image check (trivy) may flag that binary; if it does, the plan stops and asks.
8. **Preview** of unpublished changes is served under `/preview/` on the CMS hostname only, to a logged-in user.
9. **One release, `0.3.0`**, carries both the agent work already on this branch and the new public site.

Alternative kept in reserve, if rendering in the Payload app hits a wall: Astro in server mode reading Payload at
request time (two apps instead of one).

## Goals

- A publish, edit, unpublish or delete in the CMS or by the agent is visible on the public site within two seconds.
- Every page URL that exists today keeps working, with the same trailing slash and the same content.
- The pages look the same as today in light and dark mode, in English and Japanese.
- The agent's publish reply says where the page is live, or why it is not.
- Rolling back the switch is one `git revert` in homelab-terraform.

## Non-goals

- New design, new content types, comments, newsletter, analytics beacon, `WebSite` JSON-LD, a default share image.
- The contact form backend and the failover page (neither exists today; the form stays disabled).
- Redirects managed in the CMS. A small list in code covers moved URLs for now.
- Mermaid rendering (the source is shown, as today).
- Old asset URLs under `/_astro/` and `/pagefind/` stop resolving. Old `/images/` and `/fixtures/` URLs keep working.
- Running more than one replica.

## Anti-goals (these would make it a failure even if it works)

- A page in one language falling back to the other language.
- The admin, the API or a preview reachable on the public hostname or without Cloudflare Access.
- Scripts without a nonce, `unsafe-inline` for scripts, or a weaker content security policy, on public pages.
- One broken document taking the whole site down.
- A changed slug or a lost trailing slash on a published URL.
- Anything personal (home address, phone number, personal email, family details) in content, code, fixtures or tests.

## Constraints

All rules in the repository's `CLAUDE.md` hold. The ones that shape this work: this repository builds images and
never touches the cluster or homelab-terraform (the plan drafts manifests for the owner to copy); a code release is
a version tag here plus a hand-made tag bump there; schema changes ship with a migration; workloads must pass
PodSecurity `restricted` (read-only root filesystem, uid 10001); versions and config keys are checked against
current documentation and recorded in `docs/versions.md`; test databases live in `pg-stg`, never on the laptop.

## Left to the builder

File-internal structure, helper names not listed in the plan's interface blocks, and the exact markup of each
page, which is determined by the Astro source it is ported from and checked by the parity test.

## Steps only the owner can do

Commit and push in homelab-terraform; prove a `pg-main` restore before the import; run the production import
(`IMPORT_APPLY=1`); decide whether the agent may publish without review (`AGENT_AUTO_PUBLISH`); approve a trivy
exception if one is needed; decide when the old static stack is removed.
