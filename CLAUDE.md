# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# kabir-blog — rules for Claude Code

- Work phase by phase from docs/PLAN.md. Stop at each gate and show real command output.
- Verify every version, config key, CLI flag and API field against current docs before use;
  never invent them. Record pinned versions in docs/versions.md.
- Platform: Talos v1.14, Kubernetes v1.36, Cilium v1.20 Gateway API, CNPG 1.30, Argo CD.
- This repo builds images and uploads site releases only — no cluster access, no Argo CD
  knowledge, no write access to homelab-terraform. Deploy manifests and image tags live in
  homelab-terraform (prod/apps/blog/, prod/apps/cms/). Code release = vX.Y.Z tag here +
  a hand-made tag-bump commit there; rollback = git revert there. Never kubectl apply.
- Every release gets a CHANGELOG.md entry, written before the tag is pushed. Tags are never
  moved; a mistake ships as the next patch. Images build for linux/amd64 explicitly.
- Content releases go to R2 (releases/<build_id>/, LATEST, VERIFIED), never to GitOps.
- Public routing = HTTPRoute on Gateway `public`: sectionName https-apex for smkabir.com,
  https-wildcard for subdomains. Never Ingress.
- Payload admin and preview are reachable only behind Cloudflare Access, and Payload verifies
  the Access JWT. Never publish a tunnel route for them before the Access app exists.
- Payload connects to pg-main-rw directly (the pooler is transaction-mode). Its database
  and role live in homelab-terraform prod/data-platform/, never in an app folder.
- Payload schema changes ship with a committed migration. Never use push mode outside local dev.
- Workloads must pass PodSecurity `restricted` — prod/apps/* namespaces enforce it.
- Secrets are SealedSecrets in homelab-terraform or GitHub/Wrangler secrets; never plaintext in Git.
- Privacy: never put a home address, phone number, personal email or family details in content,
  code, fixtures or tests. Images must have no EXIF GPS. Run `pnpm privacy` (scripts/privacy-scan.mjs) before commit; set PRIVACY_DENYLIST in the shell for private terms.
- Published URLs are permanent: never change a slug without a redirect.
- Inline Japanese terms in English docs and UI text carry Romaji in parentheses. (Japanese-language pages are written in Japanese; they do not.)
- In docs, mark every snippet as production-ready or illustrative.

## Commands (run from the repo root; pnpm is not installed globally here, use `npx pnpm@12.9.1`)

- `pnpm install` · `pnpm dev` · `pnpm check` (astro check) · `pnpm build` (i18n check, build, dist gates, Pagefind)
- `pnpm format` / `pnpm format:check` · `pnpm test` (unit tests) · `pnpm privacy` (GPS in images, personal-data patterns)
- CMS: `docker compose up -d postgres` · `pnpm cms:migrate` · `pnpm cms:seed` · `pnpm cms:dev` (:3100) ·
  `pnpm cms:pull` · `pnpm cms:check-privacy`. Release builds set `SITE_CONTENT=cms`. See docs/cms.md.
- `payload run <script>` exits when the module loads: scripts need top-level `await`. It passes a script its flags only after a second `--`, so scripts take environment variables (see `import-fixtures.ts`).
- Public site assets: `pnpm --filter @smkabir/cms build:assets` (also `predev`, `prebuild`) writes the git-ignored `apps/cms/public/site/`.
- Production content comes from the CMS (docs/cutover.md); `pnpm cms:import` moves the fixtures into a CMS over REST (dry run unless `IMPORT_APPLY=1`).
- AI agent (MCP): `pnpm cms:agent-key`, `pnpm cms:check-agent`, `pnpm cms:check-scope`, `pnpm cms:check-hooks`; rules and operation in docs/agents.md. It edits posts, pages, projects, tags, category names, image details and the four settings, never deletes. After editing `apps/cms/src/mcp`, restart the dev server (tools are registered at startup).
  The agent's limits are enforced in CMS hooks (`apps/cms/src/hooks/agentGuards.ts`), never only in the tools. The
  audit log must not use relationships to posts or users (a foreign key made the publish hang).
- `pnpm server:test` (builds the server image and tests the sidecar and nginx; needs Docker) · `pnpm server:headers` (re-render nginx headers after editing `security-headers.json`)
- Single test (Vitest, files in `apps/<app>/tests/*.test.ts`):
  `npx pnpm@12.9.1 --filter @smkabir/site exec vitest run tests/content.test.ts -t "<name>"` (same for `@smkabir/cms`).
  Site tests always run on the fixtures (`SITE_CONTENT=fixtures` in its vitest config).
- CMS only: `--filter @smkabir/cms typecheck` · `migrate:create` (after a schema change; commit the `.ts` and `.json`) ·
  `generate:types` (regenerates `src/payload-types.ts`). `pnpm build` (the Astro site) and the diagram tests need `d2` installed locally. Parity: `PARITY_DIST=apps/site/dist pnpm --filter @smkabir/cms test` (build `apps/site` first with `SITE_CONTENT=fixtures`).

## Architecture (the parts that span several files)

pnpm monorepo, three apps (`apps/cms` now also serves the public site, see below):

- `apps/site`: the Astro static site (en + ja), still live until the cutover and the parity baseline after it. Data goes only through `src/lib/cms.ts`. Rich text is Payload Lexical
  JSON, walked by `src/lib/lexical/` and rendered by `components/RichText.astro` plus `components/blocks/*`, one
  per CMS block in `apps/cms/src/blocks`. Adding a block means changing both apps and `scripts/lib/cms-map.mjs`.
  `scripts/check-i18n.mjs` and `scripts/check-dist.mjs` are build gates, not lint.
- `apps/cms`: Payload on Next.js (`src/payload.config.ts`), Postgres (local: `compose.yaml`, port 5433). Collections,
  globals, access and hooks are in `src/`. The MCP agent is `@payloadcms/plugin-mcp`, with tools in `src/mcp/*.ts`
  registered in `src/mcp/tools.ts`. Its policy is `src/lib/agentPolicy.ts`, enforced in `hooks/agentGuards.ts`, and
  every agent write is recorded in the `AgentLog` collection. `src/lib/accessJwt.ts` verifies the Cloudflare Access JWT.
- `apps/server`: the production image, nginx plus the `content-sync` sidecar (a POSIX shell script). nginx header
  configs are generated from `apps/site/security-headers.json` by `pnpm server:headers`, and release CI fails if they drift.

Public site flow (the new site, in `apps/cms/src/site`, served by the CMS app itself): a save, publish, unpublish or delete in
the CMS or by the agent runs `hooks/invalidateSite.ts` → the in-memory snapshot (`site/data/store.ts`) is marked stale and
re-marked 2 s later (Payload's hooks run before the transaction commits) → the next request reloads it through the Local
API (`data/load.ts`, `data/map.ts`) and renders React server components (`site/views`, `src/app/(site)`). A failed reload
keeps the last good snapshot; a document that cannot be mapped is skipped and counted in `/version.json`. One replica only.
`src/proxy.ts` decides per request: `smkabir.com` (`SITE_PUBLIC_HOSTS`) serves pages and answers 404 for `/admin`, `/api`
and `/preview`; any other hostname needs the Cloudflare Access JWT (`lib/accessGate.ts`) and an unknown one fails closed.
Public pages carry a per-request script nonce. Search is server-side (`site/search.ts`); drafts preview at `/preview/` on
the CMS hostname. Until the cutover (docs/cutover.md) the Astro site, nginx sidecar and `content.yml` still exist; the
parity test keeps the new pages equal to the Astro build. Code release: tag `vX.Y.Z` → `release.yml` (CHANGELOG check,
parity, CMS unit tests, image smoke test and scan) → `ghcr.io/mursalinkabir/kabir-blog-cms:X.Y.Z`; the old
`kabir-blog-server` image and the content workflows are retired in the last step of docs/cutover.md.

## Code conventions

- Content access goes through `apps/site/src/lib/cms.ts`. Pages never read fixtures or pulled CMS files directly: `cms.ts` picks `src/content/cms` (pulled from Payload) or the fixtures.
- Pages live under `src/pages/[...locale]/` (English = no prefix, Japanese = `ja`). Use `perLocale()` for `getStaticPaths`.
- Public pages are React server components in `apps/cms/src/site` (the Astro site in `apps/site` is retired after the cutover;
  see docs/superpowers/plans). Scripts on public pages carry the per-request nonce set in `apps/cms/src/proxy.ts`; no
  other inline scripts, no `unsafe-inline` or `unsafe-eval` for scripts (`unsafe-eval` only in `next dev`). The one exception is the CMS
  "HTML embed" block: author HTML is written to `/embeds/<hash>.html` and framed with `sandbox="allow-scripts"`; that
  path has its own CSP (`security-headers.json` > `embeds`). Never add
  `unsafe-inline` to the page CSP, `allow-same-origin` to an embed frame, or `connect-src` to the embed CSP.
- A missing localized field means no page in that locale. Never fall back to another language.
- Images: any public source whose licence allows commercial reuse (Unsplash License, Wikimedia Commons, CC0/public domain, CC BY, CC BY-SA, and the other sources in docs/images.md); never Unsplash+, NC or ND licences. Credit (author, licence, source) in the media `credit` field, WebP at 480/960/1600 px, EXIF stripped. See docs/images.md.
- Design: follow docs/design.md section 10 (bento magazine, light and dark). Teal `#01ad9f` is decoration; text and buttons use `--link` (`#007a6e` light, `#5eead4` dark). Never use a raw colour in components: tokens only.
- Deployment: follow docs/deploy.md. This repo never holds cluster or homelab-terraform credentials; a code release is a tag here plus a hand-made bump in homelab-terraform. `deploy/` holds drafts to copy there, not files Argo CD reads.
- Pin every GitHub Action by commit SHA (annotated tags: use the peeled commit, see docs/versions.md) and every downloaded tool by SHA-256.
