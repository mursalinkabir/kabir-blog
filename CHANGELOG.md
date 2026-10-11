# Changelog

Every release gets an entry here, written before the `vX.Y.Z` tag is pushed.

## Unreleased

## 0.1.2 - 2026-10-12

First release that produced an image.

### Fixed

- The trivy gate stopped 0.1.1: `tiff` 4.7.1-r0, CVE-2026-4775 (HIGH, fixed in 4.7.2-r0), a dependency of
  `libgd`, which only the `nginx-module-image-filter` module needs. `nginx.conf` loads no dynamic module, so the
  Dockerfile now removes every `nginx-module-*` package from the base image; `apk del` takes `libgd`, `tiff` and
  `libxslt` with them and a build step fails if any is still installed. Re-scanned on linux/amd64: 0 HIGH/CRITICAL.
  61 image checks, 26 release-script checks and nginx's own config test pass on the slimmed image.
- Deploy drafts and the guide now use image tag `0.1.2`.

## 0.1.1 - 2026-10-12

Tagged; **no image was built.** `verify` passed and the vulnerability scan refused the image (see 0.1.2).

### Fixed

- Release verification failed at "Release script tests" (docker exit 125) on the `v0.1.0` tag, so nothing was built or
  pushed for 0.1.0. Cause: `apps/server/tests/run.sh` and `e2e.sh` read `$IMAGE`, which `release.yml` sets for the
  whole workflow to the GHCR name; the test image was built under that name and the next step looked for
  `kabir-blog-server:test`. The test scripts now use `TEST_IMAGE`. Reproduced locally by running both steps with
  `IMAGE` set as in CI (61 image checks and 26 release-script checks pass).
- Deploy drafts and the guide now use image tag `0.1.1`.

## 0.1.0 - 2026-10-12

Tagged, but **no image was built** (the verify job failed, see 0.1.1). Use 0.1.2.

### Added (HTML embeds, 2026-10-12)

- CMS block **HTML embed**: paste a self-contained HTML/CSS/JS document and it appears in the post, running its own
  script. It is isolated: written to `/embeds/<hash>.html`, framed with `sandbox="allow-scripts"`, served under its own
  CSP (`sandbox`, `connect-src 'none'`, `default-src 'none'`). The page CSP still has no inline script.
- `security-headers.json` has an `embeds` header set, rendered to `embed-headers.conf`; nginx serves `/embeds/` with it
  (immutable, noindex, no referrer). The frame is allowed by `frame-src 'self'`.
- Build gate: a frame must be `sandbox="allow-scripts"` and nothing else, no frame may point outside `/embeds/`, no
  orphan or remote-loading embed, and embed text is privacy-scanned. A draft's embed is never built.
- Tests: 16 new unit tests (embed ids, document wrapping, collection, header guarantees), 11 new image checks, and a
  real-browser run of the TraderBuddy `motion.html` through nginx (see `docs/cms.md`).
- `scanText()` takes `{ phones: false }`; embeds use it because SVG data looks like phone numbers.

### Changed (repository is `kabir-blog`, public, 2026-10-12)

- Docs, deploy drafts and the root package name refer to the repository as `kabir-blog` (R2 bucket and image names
  renamed to match: R2 bucket `kabir-blog-site`, image `ghcr.io/mursalinkabir/kabir-blog-server`; none existed yet).
  `docs/go-live.md` Part 1 now records the public repo and lists the public-repository settings.

### Changed (second language is Japanese, 2026-10-12)

- Bengali (`/bn/`) is replaced by Japanese (`/ja/`) throughout: routes, `<html lang>`, hreflang, feeds, UI strings
  (`src/i18n/ja.json`), CMS locale, fixtures, tests and docs. Details and the plan deviation: `docs/versions.md`.
- Japanese typography: system CJK font stack (no webfont; Hind Siliguri removed), strict line breaking, phrase-aware
  wrapping, character-based reading time, full-width digits and `円` in numeric table columns.
- Header: the phone menu now starts below 65rem (the desktop menu overflowed between 864 and 1040 px, also in
  English), and a long site name wraps on phones instead of hiding the menu button.
- CMS migration `locale_bn_to_ja` (safe on a database with content; proven including rollback).
- The Bengali-only sample post became the Japanese-only `homelab-de-blog-wo-unyo-suru`. The Japanese sample text is a
  first draft for review.

### Added (CMS, Phase 2 and 3, 2026-10-11)

- `apps/cms`: Payload 3.90.2 with posts, projects, pages, categories, tags, media, users and the site, now, uses and
  resume globals; English and Bengali with no fallback; per-language publish checkbox; drafts and versions; the same
  block set the renderer supports. Committed migrations (two), applied to an empty database as a gate.
- Upload privacy hook: every image is re-encoded before storage (no EXIF/GPS/XMP/IPTC/ICC), SVG and HEIC are refused.
  `pnpm cms:check-privacy` proves it with a GPS-tagged JPEG.
- `pnpm cms:seed` (local only) loads the sample fixtures into Payload; `pnpm cms:pull` pulls Payload content and media
  into the site, all or nothing; `SITE_CONTENT=cms|fixtures` selects the source and a release build must set `cms`.
- Mapper tests against a captured real Payload response (21 new tests); a CMS-built site has the same 44 pages as the
  fixture build.
- `docs/cms.md`.

### Changed (CMS)

- `check-dist.mjs` derives the expected pages from whichever content source the build used.
- Uses groups and items no longer require a name in every language (a missing one is skipped per language).

### Added

- Phase 1: pnpm workspace and the Astro site skeleton (`apps/site`), built against fixture JSON shaped like Payload `locale=all` responses.
- EN (root) and BN (`/bn/`) routing, typed string tables with a build-failing key check, self-hosted subset fonts.
- Lexical renderer with the code, terminal, callout, figure, gallery-strip, table and diagram (D2) blocks plus the inline `Jp` block.
- Finance as a third category (`/finance/`, `/finance/rss.xml`) alongside tech and Japan life; numeric table columns right-align in tabular figures.
- Bookworm-style design (see `docs/design.md`): featured post plus two-column card grid, numbered pagination, centred post layout with share links and related posts, About page with topic columns, navy footer. Light only. Mulish with Hind Siliguri for Bengali.
- Paginated home, category and tag listings (`/page/2/`, `/tech/page/2/`); `/categories/` and `/tags/` index pages; a "More" menu and phone menu built on `<details>`.
- Cover images with a flat, per-category fallback tile. Sample covers are Unsplash photos (480 / 960 / 1600 px WebP with `srcset`, credits in `docs/images.md`).
- New sample covers in `apps/site/public/images/covers/` (`CREDITS.md` lists photographer and Unsplash page for each): tech by Pakata Goh, Japan by Denys Nevozhai, finance by Nicholas Cappello. They replace the first placeholder covers on the three sample posts. Originals are 2400 px and metadata-stripped; English and Bengali alt text added (the Bengali is a first draft for review).
- Pages: about, projects, resume (English only), now, uses, contact (form UI), search (Pagefind), 404.
- Feeds (`/rss.xml`, `/bn/rss.xml`, `/tech/rss.xml`, `/finance/rss.xml`, `/japan/rss.xml`), sitemap with hreflang, `robots.txt`, `version.json`.
- Post-build gates (`scripts/check-dist.mjs`): no inline scripts, `<html lang>` per locale, no drafts, internal links and `srcset` candidates resolve.

### Changed (go-live, 2026-10-11)

- The draft `blog.yaml` routes `smkabir.com` on the Gateway's `https-apex` listener (verified present and Programmed).
- `scripts/ci/release.sh upload` is safe to re-run: an identical existing release is a no-op, different content under
  the same id is still refused. This is what lets the first publish be re-run after the route exists.
- `docs/go-live.md`: the step-by-step guide to put smkabir.com on this site.

### Added (deploy path, 2026-10-11)

- `apps/server`: the `kabir-blog-server` image (nginx 1.30 stable, non-root, read-only root) and the content-sync
  sidecar. Headers are rendered from `apps/site/security-headers.json`, so there is one source of truth.
- `scripts/ci/release.sh`: immutable releases in R2 with `LATEST` / `VERIFIED` pointers, upload verification, safe
  pruning and rollback. `scripts/ci/install-tools.sh` installs d2 and rclone pinned by SHA-256.
- Workflows: `content.yml` (build, publish, verify live, purge), `content-rollback.yml`, `release.yml` (image tests,
  trivy, push `vX.Y.Z`). All Actions pinned by commit SHA.
- `deploy/homelab-terraform/`: draft `prod/apps/blog/` manifests (restricted-profile, schema-validated) and an untested
  NetworkPolicy draft. `docs/deploy.md` is the runbook; `docs/secrets.md` the secrets register; `renovate.json`.
- Tests: 49 image checks (`pnpm server:test`), 24 release-script checks, 4 header-render checks; an end-to-end run
  with the real site through nginx.

### Fixed (code review, 2026-10-10)

- The Japanese-term tooltip no longer widens the page on phones: it is `display:none` until shown, stays inside the viewport, is hoverable, and Escape dismisses it.
- No empty `/bn/uses/`: Uses, Now, About and Resume exist (and are linked, sitemapped and in hreflang) only in the locales where they have content.
- Nested lists no longer render an empty bullet; ordered and checklist items render. (Fixture sample added.)
- The upload original is never printed: `src`, the RSS images and JSON-LD use the largest generated size.
- Missing alt text in a locale is a content gap, not an English fallback: a post whose cover has no alt in a locale has no page there, and a figure without it fails the build. An untouched (empty) editor does not create a page.
- Sitemap hreflang matches the page headers (`en`, `bn`); tag pages have real alternates; `noindex` pages (search, thank-you, empty listings) are kept out of the sitemap, and `robots.txt` no longer blocks them.
- `check-dist` also verifies absolute URLs, `#anchors`, `srcset`, drafts in feeds and the sitemap, the locale rule against content, and that no `noindex` page is sitemapped.
- Dates use the Asia/Tokyo calendar day; project and link URLs go through the safe-URL check, which now rejects backslash and control-character tricks.
- Accessibility: callouts are labelled notes (not stray landmarks), related cards use `h3`, the gallery and table labels are translated, a heading can no longer take the skip-link id, the More menu closes on focus-out, the copy button is hidden without JavaScript and reports failure, and the search page no longer steals focus.
- Pagination: pages after the first show 6 cards, so no page ends with a lone card.
- RSS: internal links are absolute, Japanese terms read as plain text, headings follow the site's h2 to h4 rule.

### Added (code review, 2026-10-10)

- `pnpm test`: 46 unit tests (pagination, safe URLs and escaping, headings, lists, the locale rule, table columns, media URLs, the privacy scan).
- `pnpm privacy` (`scripts/privacy-scan.mjs`): fails on GPS in image metadata (JPEG, WebP, PNG), personal-data patterns in text, and any `PRIVACY_DENYLIST` term.

### Removed

- 20 unused UI strings, four unused CMS accessors, the unused `home`, `redirects`, `categories` and `tags` fixtures, and stale notes about a theme toggle in the docs.

### Changed

- Design review fixes: visible focus ring and form-field borders at 3:1 or better, the current page in the nav is also marked with a bar, long-form pages (Now, Uses, Resume, projects) are left-aligned, the resume section bars are gone, card covers respond to hover, and short posts start with the contents box collapsed.
- Empty listings now say what is missing; a Bengali listing with no posts links to the English posts.
- Fixed spacing and alignment on Projects, Search, Now, 404 and the thank-you page.

- `/posts/` index removed: home is the post list. Post URLs (`/posts/<slug>/`) are unchanged.
- Dark mode removed (light only).
