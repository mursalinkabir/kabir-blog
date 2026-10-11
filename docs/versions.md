# Pinned versions and verification log

Resolved against the live npm registry and the installed packages on 2026-10-07. Production-ready facts only.

## Toolchain

| Item                  | Version                                                                                      | Notes                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Node                  | 25.2.1 (local); `engines` >= 22.12                                                           | Astro 7 requires >= 22.12                                                                                                      |
| pnpm                  | 12.9.1                                                                                       | not installed globally; run with `npx pnpm@12.9.1`. Build scripts need `allowBuilds` in `pnpm-workspace.yaml` (esbuild, sharp) |
| Astro                 | 7.3.5                                                                                        |                                                                                                                                |
| TypeScript            | 6.0.3                                                                                        | `@astrojs/check` 0.9.10 peers on TS 5 or 6, so TS 7 is not usable yet                                                          |
| astro-expressive-code | 0.44.2                                                                                       | options live in `apps/site/ec.config.mjs` (the `<Code>` component reads its config from there)                                 |
| @astrojs/sitemap      | 3.7.4                                                                                        | `i18n` option emits hreflang alternates                                                                                        |
| @astrojs/rss          | 4.0.19                                                                                       |                                                                                                                                |
| Pagefind              | 1.5.2                                                                                        |                                                                                                                                |
| Fonts                 | @fontsource-variable mulish and jetbrains-mono 5.3.0; no Japanese webfont (system CJK stack) | see docs/design.md                                                                                                             |
| d2                    | 0.9.0 (local binary)                                                                         | CI must install it; a missing binary fails the build when `CI` is set                                                          |

## Verified against the installed package (plan items marked "verify")

- **Astro i18n keys:** `defaultLocale`, `locales`, `routing.prefixDefaultLocale` (default false), `fallback`, `routing: 'manual'`. Config uses `prefixDefaultLocale: false`.
- **Astro CSP:** a hash-based `security.csp` exists, but the site does not use it. Scripts are never inlined (`vite.build.assetsInlineLimit: 0`), and `scripts/check-dist.mjs` fails the build on any inline `<script>` that is not a JSON-LD data block.
- **Pagefind and Japanese:** language is detected from `<html lang>` (indexes `en` and `ja` separately). Japanese has no spaces; Pagefind's browser code segments `ja` text, and queries were tested end to end in Chrome: a katakana word, a part of a compound (`プレート` finds `ナンバープレート`), kanji compounds and a Latin term all return the right posts. Pagefind has no stemming for `ja`, which Japanese does not need.
- **Pagefind needs CSP `'wasm-unsafe-eval'`.** Verified in Chrome: without it Pagefind logs "Failed to load the Pagefind WASM" and search returns nothing. `security-headers.json` includes it. **This corrects the CSP shown in PLAN.md.**
- **Lighthouse (mobile, production build):** accessibility 100 on every page, performance 95-100, CLS 0 (re-measured after the Bookworm-style redesign). `/search/` scores 66 on SEO only because it is `noindex` on purpose.
- **JS on post pages:** about 4 KB gzip (menu, copy-link, Japanese gloss, code-copy). No theme scripts: the site is light only.

## Deploy path (verified 2026-10-11)

| Item                         | Pin                                                                      | Notes                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| nginx base image             | `nginxinc/nginx-unprivileged:1.30.5-alpine`                              | stable branch (even minor); Alpine 3.24.2; uid 101; pid `/tmp/nginx.pid`. The cluster's `demo/hello.yaml` uses 1.27 |
| rclone                       | `1.74` from Alpine in the image; `1.74.1` (SHA-256 pinned) on CI runners | `provider = Cloudflare` env remote                                                                                  |
| jq                           | `1.8` from Alpine                                                        |                                                                                                                     |
| d2 on CI                     | `0.9.0` linux-amd64, SHA-256 `5669ddc4...fd87a9`                         | trust-on-first-use hash taken from the official release asset                                                       |
| `actions/checkout`           | v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`                        |                                                                                                                     |
| `actions/setup-node`         | v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`                        |                                                                                                                     |
| `pnpm/action-setup`          | v6.1.0 `ea17c68df8912ef543352723c149a84f56e3d413`                        | **annotated tag**: the API shows the tag object `d9184bf...`; the commit is the one pinned. Reads `packageManager`  |
| `actions/upload-artifact`    | v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`                        |                                                                                                                     |
| `actions/download-artifact`  | v8.0.2 `9000827ccba6bdab643e8b6fd33ac0654aef8333`                        |                                                                                                                     |
| `docker/setup-buildx-action` | v4.4.1 `f87e5991a6d7451dcb8d9637bfbc97413f497069`                        |                                                                                                                     |
| `docker/login-action`        | v4.6.0 `dbcb813823bdd20940b903addbd779551569679f`                        |                                                                                                                     |
| `docker/build-push-action`   | v7.4.0 `c3c9e263c25d99ce0380d002d59b67737d91b0dc`                        |                                                                                                                     |
| `aquasecurity/trivy-action`  | v0.36.0 `ed142fd0673e97e23eac54620cfb913e5ce36c25`                       | **annotated tag**: the tag object was `a9c7b0f...`                                                                  |

Verified against the live registries and repositories by `git ls-remote` (peeled refs) and by reading each
`action.yml` for the inputs used. Re-resolve when bumping; never paste a SHA from a web page or the API's `object.sha`
without checking its `type`.

### Where the deploy path departs from docs/PLAN.md

- **One image, not two.** The sidecar is the same `smkabir-site-server` image run with `command: content-sync`
  (nginx + rclone + jq). One thing to build, scan and pin; the pod runs it as three containers.
- **`init-site` init container** creates an empty redirect map so nginx can start before the first release exists.
  The plan's `include /srv/site/current/_redirects.conf` would fail nginx startup with no release; the map lives at
  `/srv/site/_redirects.conf`, and the sidecar reloads nginx with SIGHUP (so the pod sets `shareProcessNamespace`).
- **Only `/tmp` and `/srv/site` are writable**, not the three mounts in `demo/hello.yaml`: our `nginx.conf` moves
  every temp path to `/tmp`. Proven by running the image `--read-only --cap-drop ALL` as uid 101.
- **`worker_processes 1`** (image default is `auto`), to keep memory flat under the plan's 128Mi limit.
- **`^~ /_astro/`**: a regex location for static files would otherwise take precedence and strip the immutable
  caching (caught by the image tests).
- **NetworkPolicy is a draft outside `prod/apps/`** because the cluster has none today and an unverified ingress
  rule would take the site down.
- **Redirect lists are rendered with a character allow-list**, so a CMS entry can never inject nginx config.

## CMS (Phase 2 and 3, verified 2026-10-11)

| Item                    | Pin                  | Notes                                                                                        |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| payload, @payloadcms/\* | 3.90.2               | `db-postgres`, `next`, `richtext-lexical`, `storage-s3` all on the same version              |
| Next                    | 16.4.0               | Payload's own peer range                                                                     |
| React / React DOM       | 19.3.0               |                                                                                              |
| sharp                   | 0.35.5               | `withMetadata` defaults to false for generated sizes; the original is re-encoded by our hook |
| Postgres (local)        | `postgres:16-alpine` | the cluster's pg-main is 16.15                                                               |

Verified by running it, not by reading docs:

- **`payload run <script>` exits as soon as the script module has loaded.** A script that calls `main()` without
  `await` does nothing and exits 0. Scripts must use top-level `await`, and report failure with `process.exit(1)`.
- **Nested media in rich text is returned in the request locale only** (`alt` is a plain string even with
  `locale=all`). The pull therefore fetches the media collection separately (`depth=0`) and resolves block media
  from it, so both languages' alt text survive.
- **`required` on a localized field is `NOT NULL` in the `*_locales` table.** Inside an array (Uses) it would make a
  half-translated row impossible to save; those fields are optional and a missing one is skipped per language
  (migration `uses_localized_optional`).
- **Two selects named `status` collide** once drafts are on (`enum_projects_status` is also the `_status` enum). The
  project's own select sets `enumName: 'enum_projects_state'`; found by running the generated SQL, not by reading it.
- **Payload never upscales.** A 1200 px original gets 480 and 960 but no 1600.
- **Lexical output round-trips unchanged:** text, lists, tables, the `jp` inline block and callout, code, terminal,
  figure, photo-strip and diagram blocks compared byte for byte against the fixtures; only media objects differ.
- **Per-language publish status is experimental in Payload**, so publication per language is a localized checkbox
  (`publishedIn`) next to the document-level draft/published status.

## Second language: Japanese instead of Bengali (2026-10-12)

The plan (docs/PLAN.md) was written for English and Bengali. The site now has **English and Japanese**, at `/ja/`.
The plan text is left as written; this section is the record of what differs.

- **Code:** locale `ja` (`<html lang="ja">`, hreflang `ja`, `ja-JP` dates, `ja_JP` Open Graph). All `bn` keys, routes,
  feeds (`/ja/rss.xml`) and tests moved; there is no Bengali left in the site.
- **Fonts:** Hind Siliguri removed. Japanese uses the system face; the site ships no Japanese webfont.
- **Layout:** `line-break: strict`, `word-break: auto-phrase`, no italics, and a tighter desktop header. Found and
  fixed by looking at it: the desktop menu used to overflow between 864 and 1040 px (also in English); it now
  switches to the phone menu below 65rem. The site name wraps on phones instead of pushing the menu off screen.
- **Reading time** counts kana and kanji as characters (500 per minute) and Latin text as words (220 per minute).
- **Numeric table columns** accept `円`, `％` and full-width digits.
- **CMS:** locale `ja` with a hand-written migration (`locale_bn_to_ja`): it deletes Bengali rows, then renames the
  enum value in place. Payload's generated version recreates the enum with a cast and fails on any existing `bn` row.
  Proven on a scratch database that held a Bengali row, including `migrate:down` and re-apply.
- **Content:** the sample posts' Bengali text was replaced with Japanese written for this site. **It is a first draft
  for the site owner to review.** The Bengali-only sample post is now the Japanese-only post
  `homelab-de-blog-wo-unyo-suru`. The `jp` inline block's "meaning" is written in Japanese on Japanese pages.
- **Name:** the Japanese site name `ムルサリン・カビール` is a katakana rendering chosen here; confirm or change it in
  the `site` global.

## Still to verify (next phases)

- **D2 on CMS-authored source:** diagram source now comes from the CMS, written only by admins behind Access. D2
  supports file imports and remote icons; confirm the d2 flags that disable them (or sandbox the build) before a second
  author or any untrusted input is allowed.

- Payload 3.x Lexical node shapes. `src/lib/lexical/*` is written against the shape Payload documents (`type: 'block'` with `fields.blockType`, `type: 'inlineBlock'`, text `format` bit flags). **Re-verify in Phase 2** against real Payload output.
- Everything under the PLAN's "Verify before use" list for Payload, sharp, Cloudflare, CNPG and Cilium.

## Plan deviations and decisions

- Categories are tech, **finance** and Japan life (the plan listed tech and Japan life only). Route `/finance/`, feed `/finance/rss.xml`.

- CSP gains `'wasm-unsafe-eval'` (above).
- Fixtures use the `locale=all` shape: each localized field is `{ en?, ja? }`. A page exists in a locale only if `_status` is published, `publishedIn[locale]` is true and every required localized field is present.
- Diagrams: D2 renders at build to one SVG, shown via an `<img>` data URI (CSP allows `img-src data:`). Mermaid is not rendered yet and CI refuses to publish the fallback.
- The site has no Gallery page yet: it needs the media pipeline from Phase 2.
- `/posts/` no longer exists as a page: home is the post list.
- `/resume.pdf` and the OG images are Phase 3 (Playwright). The PDF download button is intentionally absent until it exists.
