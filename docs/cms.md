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
