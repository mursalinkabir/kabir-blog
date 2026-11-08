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

## Covers from Wikimedia Commons (added 2026-11-09)

Downloaded at 1600 px wide and re-encoded to `cover-<name>-480|960|1600.webp` (sharp, WebP quality 72, no metadata). Licences and rules: `docs/images.md`.
The CC BY and CC BY-SA photos are derivatives of the originals; the converted files stay under the same licence.

| Files                  | Photo                                                                                                                                                                                                                                                    | Author                    | Licence                                                         | Used by                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `cover-network-*.webp` | [Network switches](https://commons.wikimedia.org/wiki/File:Network_switches.jpg)                                                                                                                                                                         | ShakataGaNai              | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | How smkabir.com stays up                           |
| `cover-servers-*.webp` | [Wikimedia Foundation Servers-8055 15](https://commons.wikimedia.org/wiki/File:Wikimedia_Foundation_Servers-8055_15.jpg)                                                                                                                                 | Victorgrigas              | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | TraderBuddy architecture                           |
| `cover-meter-*.webp`   | [Electricity meter A21W (Osaki Electric, 1990)](https://commons.wikimedia.org/wiki/File:Electricity_meter_%E6%99%AE%E9%80%9A%E9%9B%BB%E5%8A%9B%E9%87%8F%E8%A8%88_A21W_%E5%A4%A7%E5%B4%8E%E9%9B%BB%E6%B0%97%E5%B7%A5%E6%A5%AD_1990%E5%B9%B4%E8%A3%BD.jpg) | OiMax                     | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)       | What the homelab costs to run                      |
| `cover-pi-*.webp`      | [Raspberry Pi 4 on a network switch](https://commons.wikimedia.org/wiki/File:Raspberry_Pi_4_on_a_network_switch.jpg)                                                                                                                                     | RAIL P (rail.photography) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)   | ホームラボでブログを運用する（Japanese-only post） |
