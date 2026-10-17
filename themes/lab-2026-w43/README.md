# lab-2026-w43 — Singularidade

Second weekly experiment of the visual laboratory (ISO week 2026-W43, made on Sat 2026-10-17 at the owner's request,
ahead of the Friday rhythm of D-066). CSS only, no enhancement module.

## Concept
The reading pages dressed like the cover pre-page "Singularidade" (`src/covers/singularidade/`, task 3-01), which
the owner liked: the same navy night (`#0a0d26`) under the cover's dot grid, the cover's system sans in heavy weights,
and its accents. The brand "Linkedia" becomes a heavy masthead whose "ia" takes the cover's pink-to-amber "IA"
gradient; section links, datelines and card labels are uppercase tracked labels like the cover's kicker; pale-blue
hairline rules separate the stories like the cover's headline list, the lead story opens under a pink-to-amber rule;
links are the cover's amber; the footer is set in monospace like the cover's fine print; a thin pink-to-amber rule along
the top of the window grows with the page's scroll (CSS scroll-driven animation, the technique of lab-2026-w42).

The dots never run under the text: `main` is a plain navy field with a soft edge (a same-colour `box-shadow`), so the
grid shows in the margins, the masthead and the footer only.

## Inspirations (2026-10-17)
- The magazine's own cover "Singularidade" (this repository, `src/covers/singularidade/cover.css`): palette, dot grid,
  kicker labels, rules, gradient, fine print.
- Reading-progress bar as a scroll-driven animation: MDN,
  https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline/scroll (as in lab-2026-w42).

No external code, font or asset; system fonts only.

## Accessibility
- Contrast on `--bg`: text 15.4:1, headings 17.7:1, muted 9.6:1, links 10.6:1 (hover 13.4:1), warning border 5.7:1,
  focus ring 13.3:1; on `--surface` 13.4, 8.4, 9.2. Skip link: navy on the focus yellow, 13.3:1. Rules and dots are
  decorative.
- The brand gradient is `background-clip: text` (only where supported); in forced colours the brand uses `LinkText`
  and the progress rule is hidden.
- Reduced motion: no progress rule (no animation at all). 320 px: the masthead and labels wrap; no horizontal scroll.

## Performance
About 8 KB of uncompressed CSS in the shared stylesheet (budget 40 KB). No JS, images or fonts; no layout shift.

## Reuse
Copy `theme.css`, rename the scope, keep the `data-*` hooks of the baseline markup.
