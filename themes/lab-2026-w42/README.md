# lab-2026-w42 — Broadsheet

First weekly experiment of the visual laboratory (1C-02, ISO week 2026-W42). CSS only, no enhancement module.

## Concept
The magazine read as a printed broadsheet: a light newsprint page (`#f5f0e6`) with ink-black serif text and one red
"headline ink" accent. The brand becomes a centred masthead over the section links, closed by a double rule; datelines
and section labels are short small-caps lines in a sans-serif; the lead story opens under a heavy rule with a red drop
cap, and so does an article's first paragraph. Pull quotes sit between two rules. A thin red rule along the top of the
window grows with the page's scroll — a reading-progress bar made with a CSS scroll-driven animation, no JS.

The aim is the opposite of the baseline (dark, sans-serif, boxed) while keeping its single 70ch reading column: the
experiment changes only typography, colour and rules, so it tests whether the stable `data-*` hooks are enough to give
the site a different identity without touching the markup.

## Inspirations (consulted 2026-10-17)
- Broadsheet conventions — serif masthead, hairline rules, small-caps section labels, drop caps on lead stories, flat
  surfaces on newsprint white: the community "newspaper-print" design kit,
  https://cdn.jsdelivr.net/npm/@wrongstack/core@0.295.1/design-kits/newspaper-print/KIT.md, and the curated
  NYT-style spec at https://www.webdesignhot.com/design.md/nytimes/ (near-black on white, red accent, no shadows).
- Flat surfaces and generous whitespace for large serif type: https://www.visily.ai/design-systems/sunday-editorial
- Reading-progress bar as a scroll-driven animation (`animation-timeline: scroll(root block)` scaling a fixed bar):
  MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline/scroll, and
  https://ics.media/en/entry/230718/

No code, font or asset was copied; the palette, the rules and the CSS are original. The fonts are the reader's system
serif (Iowan Old Style, Charter, Sitka, Cambria, Noto Serif, Georgia…) — no webfont, no CDN.

## Accessibility
- Contrast on `--bg`: text 15.4:1, muted 7.0:1, links 7.1:1 (hover 10.9:1), warning border 5.9:1, focus ring 6.7:1; on
  `--surface` 13.8, 6.3, 6.3. Skip link: white on the focus blue, 7.6:1. Hairline rules are decorative.
- The drop cap is `::first-letter` styling: screen readers and copy/paste read the paragraph unchanged.
- Reduced motion: the progress rule is not drawn at all. Browsers without scroll timelines (Firefox at the time of
  writing) also show no rule; nothing else depends on it.
- Forced colors: the progress rule is hidden and the drop cap uses `CanvasText`.
- 320 px: the masthead wraps (brand on its own line, links centred below); no horizontal scroll.

## Performance
About 7 KB of uncompressed CSS added to the shared stylesheet (budget 40 KB). No JS, no images, no fonts, no layout
shift (the progress rule is `position: fixed` and animates `transform` only, on the compositor).

## Fallback
CSS only, so there is nothing to fail at runtime: the switcher's "Base" slot returns to `minimal-dark`, and a reader
without JS gets this theme as the build-time default with full reading.

## Reuse
Copy `theme.css`, replace `:root[data-theme='lab-2026-w42']` with `:root` (or your own scope) and add the hooks it
styles to your markup: `data-site-header`, `data-brand`, `data-site-footer`, `data-card` / `data-lead`, `data-edition`,
`data-article`, `data-summary`, `data-block`, `data-tags`, `data-theme-switcher`, plus the `.meta` and `.pular`
classes. The custom properties at the top are the design tokens (`--bg`, `--fg`, `--accent`, `--font-body`,
`--font-label`, `--measure`…). The progress rule needs only `body::before` and the `@keyframes`; rename the keyframes
if you drop the theme prefix. Licence: MIT, like the rest of the repository's code.

## Source
Added in the magazine commit that closes 1C-02; the manifest's `git_ref` is set when the theme is archived.
