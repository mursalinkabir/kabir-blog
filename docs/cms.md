# The CMS (Payload) and how the site reads it

Snippets are marked **production-ready** (what CI or you run for real) or **illustrative** (shape only).

## What exists

| Part                          | Where                                               | Notes                                                                                         |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Payload 3.90.2 on Next 16.4.0 | `apps/cms`                                          | admin at `/admin`, REST at `/api`, GraphQL disabled                                           |
| Collections                   | `apps/cms/src/collections`                          | users, media, categories, tags, posts, projects, pages                                        |
| Globals                       | `apps/cms/src/globals`                              | site, now, uses, resume                                                                       |
| Rich-text blocks              | `apps/cms/src/blocks`                               | code, terminal, callout, figure, gallery-strip, diagram, and the inline `jp` term             |
| Upload privacy hook           | `apps/cms/src/hooks/stripImageMetadata.ts`          | re-encodes every upload before storage: no EXIF, GPS, XMP, IPTC or ICC in the stored original |
| Migrations                    | `apps/cms/src/migrations`                           | committed; `push` is off everywhere                                                           |
| Seed (local only)             | `apps/cms/src/scripts/seed.ts`                      | loads the site fixtures into Payload; refuses any database host except localhost              |
| Pull script and mapper        | `apps/site/scripts/pull-cms.mjs`, `lib/cms-map.mjs` | Payload REST to the site's content files                                                      |

## Run it locally (production-ready commands)

```sh
docker compose up -d postgres                 # Postgres 16 on 127.0.0.1:5433
cp apps/cms/.env.example apps/cms/.env        # then set PAYLOAD_SECRET (openssl rand -hex 32)
npx pnpm@12.9.1 install
npx pnpm@12.9.1 cms:migrate                   # apply the committed migrations
npx pnpm@12.9.1 cms:seed                      # sample content + users; writes apps/cms/.dev-credentials
npx pnpm@12.9.1 cms:dev                       # http://localhost:3100/admin
```

`apps/cms/.dev-credentials` (git-ignored, mode 0600) holds the generated admin password and the read-only builder key.
`SEED_RESET=1 pnpm cms:seed` empties the content collections first.

Build the site from the CMS (production-ready):

```sh
set -a; . apps/cms/.dev-credentials; set +a      # CMS_API_KEY
npx pnpm@12.9.1 cms:pull                         # writes apps/site/src/content/cms and apps/site/public/media
SITE_CONTENT=cms npx pnpm@12.9.1 build           # fails if nothing was pulled
```

## How the site decides what to read

`apps/site/src/lib/cms.ts` reads `src/content/cms/` (pulled) or `src/content/fixtures/` (committed samples). They have
the same layout and the same shapes, so pages cannot tell them apart.

- `SITE_CONTENT=cms` requires pulled content and fails otherwise. **A release build must set it**, so a failed pull can
  never quietly publish sample content.
- `SITE_CONTENT=fixtures` forces the samples (the tests do this).
- Unset: pulled content if present, else fixtures. The "sample content" banner shows only for fixtures.

## The pull is all or nothing

`pull-cms.mjs` fetches everything and maps it in memory. It replaces `src/content/cms` and `public/media` only after
every request and download succeeded, and it exits non-zero (leaving the previous output) when the CMS is unreachable,
a request fails, or there are no published posts.

Media rules: only files used by **published** documents are downloaded (a draft's cover never reaches `dist/`), and only
the generated sizes, because the site never prints the original. The original is downloaded only when an image is too
small to have any generated size. Filenames are validated before they are used as paths.

The mapper (`cms-map.mjs`) turns Payload's responses into the site's shapes: `null`, `""` and an untouched editor all
mean "not written in that language" and are dropped, never filled from another language. A published document that
points at deleted media fails the build with the document named.

## Language rule, as the CMS enforces it

- English and Japanese are separate fields (`fallback: false`).
- A post's **Visible in this language** checkbox is per language. Title, description and text are required only in a
  language where it is on, so a Japanese-only post is possible without inventing an English title.
- The site shows a page in a language only when every required field exists in it (title, description, text and, for a
  cover, its alt text in that language). `check-dist.mjs` re-derives this from the content and fails the build if a page
  exists that should not, or is missing that should exist.

## Checks (production-ready)

```sh
npx pnpm@12.9.1 cms:check-privacy   # GPS upload is stored clean; SVG refused (needs the local database)
npx pnpm@12.9.1 test                # includes the mapper tests against a captured Payload response
```

To re-capture the response the mapper tests use (illustrative; run when the CMS schema changes):

```sh
cd apps/site && node scripts/pull-cms.mjs --raw tests/fixtures/payload-raw.json
```

## Deviations from docs/PLAN.md

- **Media is on local disk until the R2 media bucket exists.** The R2 adapter is wired and switches on when
  `S3_BUCKET` is set (Phase 4). The site copies media into the release itself (`/media/...`), so the first deploy needs
  no separate media domain.
- **Webp only, no AVIF**, three widths (480 / 960 / 1600), never upscaled. An image narrower than 480 px has no
  generated size and the site uses the (metadata-stripped) original.
- **SVG uploads are refused** (can carry script). The sample illustrations are rasterised by the seed.
- **The privacy gate uses the repo's own detector (`scripts/privacy-scan.mjs`)** instead of `exiftool`, so it runs
  anywhere. It reads EXIF, XMP and PNG/WebP metadata blocks directly.
- **`payload-types.ts` is generated but the site does not import it.** The site keeps `src/lib/types.ts`, and
  `cms-map.mjs` is the one bridge between them (with a test against a real response). Importing the CMS package's
  types into the site would couple the site build to the CMS's dependency tree.
- **Album and gallery collections are not built yet.** The photo strip block covers the plan's photo posts.
- **No blurhash.** Not needed for a static site with fixed-aspect covers.
- **Previews, publish hooks and the CMS image** are Phase 4 and Phase 7.

## HTML embeds: author HTML with JavaScript

The editor has an **HTML embed** block for a self-contained piece of HTML, CSS and JavaScript: an animation, a
calculator, an interactive explainer. Paste a complete page or a fragment; set a title (the frame's accessible name),
a starting height and an optional caption.

**How it is kept safe** (production-ready design; `apps/site/src/lib/embeds.ts` is the code):

| Layer                                                    | What it guarantees                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The HTML is never part of a page                         | It is written to `/embeds/<content-hash>.html`; the post holds only an `<iframe>`.                      |
| `sandbox="allow-scripts"` on the frame                   | An opaque origin: no cookies, no storage, no access to the site's DOM, no navigation, no popups, forms. |
| `/embeds/` has its own CSP (`sandbox allow-scripts` too) | The document is isolated even if someone opens its URL directly.                                        |
| `connect-src 'none'`, `default-src 'none'`               | It cannot send anything anywhere, and cannot load remote scripts, styles, fonts, images or frames.      |
| The page CSP is unchanged                                | Still no inline script on any page: `unsafe-inline` for scripts exists only under `/embeds/`.           |
| `check-dist.mjs`                                         | Fails the build on a frame without exactly that sandbox, an orphan or remote-loading embed, a leak.     |

So an embed **cannot**: read or change the site, read cookies or storage, make any network request (including to the
same site), load a library from a CDN, open windows or navigate the page. **Put everything inline.** Links inside an
embed that point at other pages do not work (no navigation is allowed); put such links in the post text.

What it **can** do: run any script that works on its own (canvas, SVG, timers, `requestAnimationFrame`, `<audio>` from
a `data:` URL...), and size itself: the frame follows the embed's content height.

Verified on 2026-10-12 with the real TraderBuddy `docs/motion.html` (27 KB, unmodified): it runs, all seven scenes
build, the frame resizes from 480 to 796 px, `window.origin` is `"null"`, `localStorage`, `document.cookie` and
`parent.document` all throw, and `fetch` to the same site and to a remote site are both blocked by the CSP, including
when the embed URL is opened directly.

Other facts:

- Which embeds are built follows which pages are built: a draft's embed is never written to `dist/` (tested).
- The embed text is privacy-scanned at build time (emails, postal codes, address markers, `PRIVACY_DENYLIST`). The
  phone-number heuristic is skipped for embeds, because SVG data and script are full of digit groups.
- Size limit 300 KB per embed. The same HTML in two posts is one file.
- RSS readers get a one-line "interactive content, view it on the website" note instead of the embed.
- The embed is not indexed by search engines or Pagefind, and is not in the sitemap.
- Anyone who can edit in the CMS can add one. Admin access sits behind Cloudflare Access; the isolation above is what
  makes that acceptable. Treat embeds like code you publish: do not paste HTML you did not write or read.
- The failover Worker (Phase 9) must serve `/embeds/*` with the `embeds` header set from `security-headers.json`, not
  the page set, or an embed would be served with the page CSP and simply not run.
