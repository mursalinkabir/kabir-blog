# smkabir-site — rules for Claude Code

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
- `payload run <script>` exits when the module loads: scripts need top-level `await`.
- `pnpm server:test` (builds the server image and tests the sidecar and nginx; needs Docker) · `pnpm server:headers` (re-render nginx headers after editing `security-headers.json`)

## Code conventions

- Content access goes through `apps/site/src/lib/cms.ts`. Pages never read fixtures or pulled CMS files directly: `cms.ts` picks `src/content/cms` (pulled from Payload) or the fixtures.
- Pages live under `src/pages/[...locale]/` (English = no prefix, Japanese = `ja`). Use `perLocale()` for `getStaticPaths`.
- No inline scripts on the public site. Put scripts in `src/scripts/` or `public/`.
- A missing localized field means no page in that locale. Never fall back to another language.
- Images: Unsplash License photos only (never Unsplash+), credit in the media `credit` field, WebP at 480/960/1600 px. See docs/images.md.
- Design: follow docs/design.md (Bookworm-style, light only). Teal `#01ad9f` is decoration; text and buttons use `#007a6e`.
- Deployment: follow docs/deploy.md. This repo never holds cluster or homelab-terraform credentials; a code release is a tag here plus a hand-made bump in homelab-terraform. `deploy/` holds drafts to copy there, not files Argo CD reads.
- Pin every GitHub Action by commit SHA (annotated tags: use the peeled commit, see docs/versions.md) and every downloaded tool by SHA-256.
