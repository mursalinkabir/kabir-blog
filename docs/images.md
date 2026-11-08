# Images

## Rules

- **Sources.** Photos and illustrations may come from any public source whose licence allows commercial reuse
  (the site is not paid, but the licence must not forbid it). Decided by the site owner on 2026-11-08; it replaces the earlier
  "Unsplash only" rule. The sources below were checked from this repo's tooling on that date. Prefer them in this order:
  1. **Wikimedia Commons** (best for places, history and Japan). Each file page states its licence and author.
  2. **Unsplash** (the free Unsplash License; **never Unsplash+**, which is paid and not covered).
  3. **Other free sources**, when Commons has nothing: Openverse (a search index over CC and public-domain works), Flickr
     (Creative Commons photos only), public-domain museum and library collections (Art Institute of Chicago, the Met Open Access, the
     National Diet Library, Internet Archive), government sources whose terms allow reuse, and Pexels or Pixabay (their own licences allow it).
- **Licences that are fine:** CC0, public domain, the Unsplash/Pexels/Pixabay licences, CC BY, CC BY-SA.
  **Not fine:** any NC (non-commercial) or ND (no-derivatives) licence, "all rights reserved", a photo found only on a
  company or blog page with no licence, anything marked Unsplash+, and AI-generated images presented as photographs.
  If the licence is unclear, do not use the image.
- **We always change the file** (resize, WebP, strip metadata), so ND is out. **CC BY-SA** means the adapted image stays under CC BY-SA:
  the credit must say so, with a link to the licence, and the post's own text is not affected. Prefer CC0, public domain and CC BY
  when there is a choice, because they ask for less.
- **Credit** goes in the media `credit` field, and the site prints it under the image. Format: `Photo: <author>, <licence> (<source>)`,
  for example `Photo: Souka Kinmei, CC0 (Wikimedia Commons)`. Public-domain items still name the source. Keep the file page URL
  in the Credits table below, so the licence can be checked again later.
- **Strip EXIF.** Downloads from Commons and Flickr often carry camera data and sometimes GPS. Re-encoding to WebP with sharp drops it;
  `pnpm privacy` fails the commit on GPS.
- **The picture must be what the text says it is.** Use a photo of Hachiōji only if it shows Hachiōji. Never label a generic photo as a specific place.
- People: no recognisable face in the foreground, no number plate, no house number. Public signage and distant passers-by are accepted (see below).
- Screenshots of your own software (for example TraderBuddy) are your own work and need no licence. Before publishing,
  remove anything personal: holdings, account names or emails, private conversations. The TraderBuddy screenshots in
  `apps/site/public/images/traderbuddy/` had the "you hold this" dots painted out.
- Photos you take yourself must not show a recognisable person, a number plate, a house or a street sign (see the privacy rules in `docs/PLAN.md`). Stock photos from Unsplash may show public signage and distant passers-by; the Japan sample cover has readable shop signs, which is accepted because it is a public commercial street.
- In production, images are uploaded to Payload's `media` collection (alt text required, credit in the `credit`
  field). Payload generates the 480 / 960 / 1600 px sizes; the site builds `srcset` from them.
  The fixtures below mimic that by hand.
- Card and cover images are decorative (`alt=""`): the title link next to them names the destination.
  Post covers still need real alt text in Payload, because the post page shows them as content.
- Posts with no cover get a teal tile with the category icon.

## Which sources can be reached from here (checked 2026-11-08)

| Source                                                                        | From curl or WebFetch                                                                 | Notes                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Wikimedia Commons (`commons.wikimedia.org/w/api.php`)                         | Works. Send a descriptive `User-Agent`                                                | Search, licence and author through `extmetadata`. Download a resized copy with `Special:FilePath/<name>?width=1600`. |
| Openverse API (`api.openverse.org/v1/images/`)                                | Works without a key                                                                   | Aggregates Commons, Flickr and museums, with licence fields. Good first search.                                      |
| Flickr (feeds and pages)                                                      | Works                                                                                 | Only photos under a CC licence that passes the rules above; check the licence on each photo.                         |
| Art Institute of Chicago API, Met Open Access, NDL Digital, Internet Archive  | Work                                                                                  | Public-domain art, maps and old prints. Good for history. Check each item's rights statement.                        |
| Unsplash                                                                      | Photo pages work through WebFetch; scripted page access is bot-checked, the CDN works | Do not try to evade the bot check.                                                                                   |
| Pexels, Pixabay, Library of Congress, Europeana, Smithsonian, Tokyo open data | Blocked (HTTP 403) for scripts                                                        | Open the page with WebFetch instead, or skip it.                                                                     |

Not an exhaustive list: if you find another source, record its licence and how you fetched the file here.

## Sample covers

The three sample posts use the photos in `apps/site/public/images/covers/`. File names, photographers, Unsplash pages and
pixel sizes are in [`CREDITS.md`](../apps/site/public/images/covers/CREDITS.md) next to the files.

- The `cover-*.jpg` originals are 2400 px wide and metadata-stripped. Never overwrite them.
- Derived `cover-<name>-480|960|1600.webp` files feed `srcset` (sharp, WebP quality 72), which keeps a card image to roughly 14 to 45 KB on phones.
- Alt text (English and Japanese) and the credit string are in each post's `hero` field in `src/content/fixtures/posts/`.
- Posts with no cover (the Japanese-only sample post and the draft) show the category's fallback tile on purpose.

Superseded: the first placeholder covers `apps/site/public/fixtures/cover-*.webp` are no longer referenced by any post and can be deleted.
`sample-landscape.svg` and `sample-portrait.svg` are still used inside the sample posts' figure and gallery blocks.

`scripts/check-dist.mjs` fails the build if any `src` or `srcset` candidate in the built HTML does not exist.

## The upload original is never printed

`apps/site/src/lib/media.ts` `publicUrl()` returns the largest generated size, and `MediaImage`, the RSS feed and the JSON-LD `image` all use it. The `cover-*.jpg` originals still sit in `public/images/covers/` because they are metadata-stripped Unsplash files; in production the originals stay in Payload's storage and are never published.
