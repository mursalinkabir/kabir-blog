# Cover photo credits

Photos from [Unsplash](https://unsplash.com/), used under the
[Unsplash License](https://unsplash.com/license) (free to use; credit appreciated, so the site prints it under each post cover).

| File                | Photographer      | Unsplash page                           | Size (px)   | Used by                                            |
| ------------------- | ----------------- | --------------------------------------- | ----------- | -------------------------------------------------- |
| `cover-tech.jpg`    | Pakata Goh        | https://unsplash.com/photos/EJMTKCZ00I0 | 2400 × 1920 | How this site is built: a static blog on a homelab |
| `cover-japan.jpg`   | Denys Nevozhai    | https://unsplash.com/photos/D68ADLeMh5Q | 2400 × 1658 | The Japanese words that paperwork actually uses    |
| `cover-finance.jpg` | Nicholas Cappello | https://unsplash.com/photos/Wb63zqJ5gnE | 2400 × 1594 | What the homelab costs to run, in yen              |

## Files

- The three `cover-*.jpg` originals are as supplied: metadata-stripped (only the basic JFIF header remains; no Exif, GPS, XMP, ICC or IPTC).
- `cover-<name>-480.webp`, `-960.webp` and `-1600.webp` are derived copies (sharp, WebP quality 72) used for `srcset`. The site picks the smallest size that fits, so phones download about 14 KB for a card instead of 300 to 440 KB.
- Alt text (English and Japanese) and the credit string live in the post fixtures, in each post's `hero` field. The Japanese alt text is a first draft for the site owner to review.
