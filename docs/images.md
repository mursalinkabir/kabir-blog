# Images

## Rules

- Photos come from [Unsplash](https://unsplash.com/) under the Unsplash License (free for commercial use, no
  permission needed; credit is appreciated, so the site prints it under the post cover).
- **Unsplash+ photos are paid and not covered by that licence.** The grid marks them as premium; do not use them.
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
