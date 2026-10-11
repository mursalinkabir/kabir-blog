# Design plan: Bookworm-inspired redesign

Status: **built** (2026-10-08). Decisions are in section 6; what differs from the first plan is listed in section 8. Replaces the "hanging from the line" design, which was rejected on 2026-10-08.
Reference: [Bookworm Light](https://bookworm-light-astro.vercel.app/) (Themefisher, Astro). The plan below takes its
layout and visual language, but no code or assets. The content model, i18n, Pagefind, finance tables, code blocks,
diagrams and the CSP rules from `docs/PLAN.md` stay as they are. Only the presentation layer changes.

## 1. What the reference does (measured 2026-10-08)

| Aspect         | Bookworm Light                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feel           | Clean, airy, image-led magazine blog. White page, one accent, rounded corners, a navy footer.                                                        |
| Font           | Mulish everywhere (headings 700, body 400)                                                                                                           |
| Type scale     | 1.2 ratio: 16 / 19.2 / 23 / 27.6 / 33.2 / 39.8 px; body 16 px, line-height 26 px                                                                     |
| Colours        | headings `#152035` (navy) · body `#747577` (grey) · accent `#01AD9F` (teal) · surface `#FAFAFA` · footer `#152035`                                   |
| Container      | about 1000 px for the header; content column about 806 px on posts                                                                                   |
| Corners        | 6 px (buttons, pagination), 8 px (images, quotes, tag pills)                                                                                         |
| Header         | Logo left, nav centred (Home, About, Contact, Pages dropdown), search icon right; transparent, 84 px tall                                            |
| Home           | One **featured** post full-width (large image, meta, title, excerpt), then a **2-column grid** of post cards, then numbered pagination               |
| Card           | Rounded image, meta row (author avatar and name, date with calendar icon, category with grid icon), bold title, 2-line grey excerpt                  |
| Post page      | Centred title, centred meta row, wide image, narrower text column, quote with teal left border on a grey panel, tag pills and share icons at the end |
| Taxonomy pages | Centred title with a short teal underline bar; categories and tags as grey pills with an icon                                                        |
| About          | Photo left, intro and a "Get in touch" button right; "What I do" in 3 centred columns below                                                          |
| Footer         | Navy band: centred links, a row of outlined square social buttons, copyright                                                                         |

## 2. What we adopt, adapt or skip

| Bookworm element                             | Decision for smkabir.com                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mulish, 1.2 scale, navy, grey, teal          | **Adopt.** Mulish for Latin. Japanese uses the reader's system CJK face (Hiragino, Yu Gothic, Noto Sans CJK, Meiryo): a Japanese webfont is megabytes even subset.                                           |
| Teal `#01AD9F`                               | **Adapt.** It is only 2.81:1 on white, which fails WCAG AA for text. Use it for decoration (bars, borders, active pagination outline). Use `#007A6E` (5.24:1) for links, buttons and anything carrying text. |
| Body 16 px                                   | **Adapt.** Keep 16 px on cards and listings; post body 17 px / 1.75 for long reads. Japanese body 1.85 (prose 1.95), `line-break: strict` and `word-break: auto-phrase`.                                     |
| Featured post + 2-column grid + pagination   | **Adopt.** 1 featured + 6 grid posts per page; `/page/2/`, `/ja/page/2/`.                                                                                                                                    |
| Card with image                              | **Adopt.** Needs a cover image per post (section 6).                                                                                                                                                         |
| Author avatar in meta                        | **Adapt.** Single author, so a small round avatar and name. Needs a photo (section 6).                                                                                                                       |
| Calendar and grid icons in meta              | **Adapt.** Calendar icon for date; category icons per subject: chip for Tech, coin (¥) for Finance, torii gate for Japan life. Inline SVG, no icon font.                                                     |
| "Pages" dropdown                             | **Adopt** as "More" (Projects, Resume, Now, Uses, Tags), built with `<details>` so it works without JS.                                                                                                      |
| Authors pages, Elements page, Privacy policy | **Skip** authors and elements (single author, not a theme demo). Privacy page: optional; only needed if analytics or the contact form need one.                                                              |
| Share icons on posts                         | **Adopt** as plain links (X, LinkedIn, Facebook, Hatena Bookmark, copy link). No third-party scripts.                                                                                                        |
| Social buttons in footer                     | **Adopt.** GitHub, LinkedIn, X, RSS, from the `site` global.                                                                                                                                                 |
| No dark mode                                 | **Adopt: light only.** Remove the theme toggle, `theme-init.js` and dark tokens.                                                                                                                             |
| Centred taxonomy title with teal bar         | **Adopt** for Categories, Tags, Search, Contact and listing pages.                                                                                                                                           |

## 3. Tokens

```css
/* illustrative: final values go in apps/site/src/styles/global.css */
:root {
  --heading: #152035; /* navy: titles, nav, footer band */
  --text: #5c5e62; /* body. Bookworm uses #747577 (4.61:1); slightly darker for long reads (6.5:1) */
  --muted: #747577; /* meta rows, excerpts */
  --accent: #01ad9f; /* decoration only: bars, borders, focus ring */
  --link: #007a6e; /* links, buttons, active states (5.24:1) */
  --surface: #fafafa; /* quotes, pills, code inline */
  --border: #e9ebef;
  --bg: #ffffff;
  --radius-sm: 6px; /* buttons, pagination */
  --radius: 8px; /* images, cards, pills, quotes */
  --container: 1170px; /* listing pages */
  --content: 808px; /* article column */
}
```

Type: Mulish (variable, latin) then the system Japanese face for everything; JetBrains Mono for code.
Scale 1.2: h1 40 px, h2 33 px, h3 28 px (card titles in the grid 28 px, featured title 33 px), h4 23 px.

## 4. Page plans

The ASCII layouts below are **illustrative**: they show structure, not final spacing.

### Header (all pages)

```
[logo  Mursalin Kabir]     Home  Tech  Finance  Japan  About  Contact  More ▾     EN|বাং  🔍
```

Transparent on white, 84 px tall. Phones: logo, search and a menu button; the nav opens as a panel (`<details>`).

### Home `/` and `/ja/`

```
┌──────────────────────────────────────────────────────────┐
│                [ featured post cover, 16:9, r8 ]         │
└──────────────────────────────────────────────────────────┘
 (o) Mursalin  📅 4 Oct 2026  ¥ Finance
 What the homelab costs to run, in yen            ← 33 px navy
 A plain ledger of power, internet and storage…   ← 2 lines grey

┌─────────────────────────┐   ┌─────────────────────────┐
│ [cover 16:9]            │   │ [cover 16:9]            │
│ (o) MK 📅 date  ⌘ Tech  │   │ (o) MK 📅 date ⛩ Japan  │
│ Post title (28 px)      │   │ Post title              │
│ Excerpt, 2 lines        │   │ Excerpt, 2 lines        │
└─────────────────────────┘   └─────────────────────────┘
          … 3 rows …
                 [‹] [1] [2] [›]
```

No intro block, as in Bookworm: the page starts with the featured post, and identity lives on About.

### Post `/posts/<slug>/`

```
              Post title, centred, 40 px
       (o) Mursalin  📅 4 Oct 2026  ¥ Finance  ·  4 min read
┌──────────────────────────────────────────────────────────┐
│                 [ cover image, 936 px, r8 ]              │
└──────────────────────────────────────────────────────────┘
        ┌──────── 808 px text column ────────┐
        │ table of contents (collapsible)    │
        │ body, h2/h3, code, tables, D2…     │
        │ ▌ quote: teal 4 px left border,    │
        │ ▌ #FAFAFA panel, r8, italic        │
        │ #tag #tag              share icons │
        │ ── Related posts (2 cards) ──      │
        └────────────────────────────────────┘
```

Code blocks: Expressive Code, `github-light`, r8. Finance tables: light grey header row, tabular
numbers, right-aligned numeric columns (renderer already does this). Callouts: same panel style as quotes, in
teal, amber or red.

### Category `/tech/`, `/finance/`, `/japan/` and tag `/tags/<tag>/`

Centred title with a short teal bar, one-line description, then the same 2-column card grid, then pagination.

### Categories `/categories/` and Tags `/tags/` (new index pages)

Centred title with a teal bar; pills on `#FAFAFA` with the category icon and post count.

### About

Photo left (r8), "I'm Mursalin Kabir…" heading and intro right, "Get in touch" button (teal `#007A6E`, white text).
Below, "What I write about" in 3 centred columns: Tech, Finance, Japan life, each linking to its category.

### Projects, Resume, Now, Uses

- **Projects:** the same card grid (cover, title, summary, status pill).
- **Resume:** a single centred column with section headings that carry the teal bar.
- **Now and Uses:** use the post article layout without a cover.

### Contact and Search

Centred title with the teal bar. Contact: a two-column form (name and email side by side, message full width), r6
inputs on `#FAFAFA`, a teal button. Search: Pagefind UI styled with the same tokens.

### Footer

Navy `#152035` band: centred links (About, Contact, Now, Uses, RSS), a row of 44 px outlined square social buttons
(r6), then copyright and "Built with Astro and Payload".

## 5. Behaviour and quality floor (unchanged)

- No inline scripts. Menu and dropdown use `<details>`. Search stays as it is; there is no theme toggle.
- Lighthouse budget: performance ≥ 95, accessibility 100, CLS < 0.05, post JS ≤ 30 KB gzip.
- Japanese: system face (no download), line-height 1.85, headings 1.5, no italics in blockquotes. The header is tighter on `/ja/` (smaller name and gaps) and switches to the phone menu below 65rem.
- Cover images are the LCP element on listings: the featured one is `loading="eager"` with `fetchpriority="high"`;
  the rest are lazy. Sizes come from Payload's `imageSizes` (480/960/1600 w, AVIF/WebP).

## 6. Decisions (2026-10-08)

| Question                   | Decision                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Post without a cover image | **Generated fallback**: soft teal tint with the category icon. Posts can publish without a cover. |
| Author photo               | **Initials monogram** (round "MK" badge) until a photo is added in Payload.                       |
| Dark mode                  | **Light only.** No toggle.                                                                        |
| Home intro                 | **None.** Home starts with the featured post.                                                     |

## 7. Implementation steps (after approval)

1. Fonts: add Mulish (variable); remove Bricolage, Newsreader, Anek Bangla and Noto Serif Bengali. (Hind Siliguri, added for Bengali, was removed when the second language became Japanese.)
2. Rewrite `global.css` with the tokens above. Drop the seal, matra rules, rickshaw panels, dark theme, theme toggle and `public/theme-init.js`.
3. Components: `PostCard` (featured and grid variants), `PostMeta`, `CategoryIcon`, `Pagination`, `Header` with `<details>` menu, `Footer` with social buttons, `ShareLinks`, `RelatedPosts`.
4. Routes: paginated home and category pages (`/page/[n]/`), new `/categories/` and `/tags/` indexes.
5. Fixtures: cover images for the sample posts; `site.socials`; avatar field.
6. Re-run every gate: `astro check`, `check-dist`, Lighthouse, behaviour tests under the CSP, screenshots on desktop and mobile.

## 8. As built (differences from the plan above)

- **Container is 1000 px**, not 1170 px: that is what the reference measures.
- **`/posts/` is gone.** Home is the paginated post list (`/`, `/page/2/`); posts keep `/posts/<slug>/`. The
  category and tag listings paginate the same way (`/tech/page/2/`). Page size is 7 (1 featured + 6 cards);
  `SITE_PAGE_SIZE` overrides it for testing.
- **Colours:** muted text is `#6a6b6e` and the warning colour `#9a5000` (the reference values fell just under 4.5:1 on the grey panel).
  The logo mark uses `#007a6e`, not the reference teal (white on `#01ad9f` is 2.8:1).
- **Icons are inline SVG**, including the share buttons (letter glyphs failed the label-matches-text check).
- **Social buttons** in the footer render only for accounts set in the `site` global (none yet) plus RSS and email.
- **Fonts:** Mulish (variable, Latin 32 KB). No Japanese webfont: the system stack is used.
- **Real photos** from Unsplash for the three sample covers (see `docs/images.md`), served as WebP at 480 / 960 / 1600 px.

## 9. Measured (Lighthouse mobile, production build, local preview)

Accessibility 100 on all 15 page types tested. Performance 95–100; layout shift 0. `/search/` scores 66 on SEO only
because it is `noindex` on purpose. Post pages ship 1.6 KB of JavaScript (gzip) plus about 4 KB of share and menu scripts.
