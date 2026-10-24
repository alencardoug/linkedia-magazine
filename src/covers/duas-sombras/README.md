# Duas sombras — cover of 2026-W43

The second weekly cover (Codex's concept #1 from the 3-01 brainstorm, first in the owner's queue; built on
2026-10-23 by Claude with Codex's plan critique). A gallery corner rendered live: a clear glass block holds a row of
ultramarine ceramic blades; seen from the visitor's side they spell nothing, yet one lamp throws **IA** on the acid
wall and the other **DIA** on the vermilion wall. The block follows the pointer or the finger, the follow-spots track
it and both words slide along the walls without ever breaking; on a click, tap or Enter the lamp rushes in and the
shadows swallow the room before `/revista` appears. "O dia tem duas sombras": a daily AI magazine, IA inside DIA.
Everything is code written by AI: no image, no library, no model at run time.

## The trick
Two words drawn from simple shapes (`sculpture.ts`: boxes, the A's slanted legs, the D's half annulus; cap height 1),
"DIA" along x and "IA" along z. Their extrusions intersect in V = DIA(x, y) ∧ IA(z, y). Seen along z, V casts exactly
"DIA" when every row y of "IA" holds ink, and seen along x exactly "IA" when every row of "DIA" does — true, because
both words contain a full-height I stem. V alone is a block of crossed letters; the blades are V cut by periodic
vertical bands of normal (−cos θ, 0, sin θ), spacing s and thickness τ. They keep both shadows exact when
STROKE·min(sin θ, cos θ) > s − τ: along any I stem of the other word the band coordinate sweeps more than the gap
between blades, so some blade catches the light at every ink point, and the blades never leave V. The margin is kept
at ≥ 0.05 cap heights (Codex's critique) and checked on a grid for many editions, also with thinned blades
(`tests/duas-sombras.test.mjs`). Each edition carves its own sculpture: the edition date seeds θ (40–50°), s, τ and
the bands' phase; the label prints the blade count and angle.

## What runs
- `Cover.astro` + `cover.css`: the complete HTML cover — a museum label (masthead, the work, a caption with the
  edition date, the lead headlines, the hint and the viewport-wide link) beside a flat CSS poster of the gallery
  (two walls with their words, a striped glass block). It is what devices without JS or WebGL2, or with forced
  colours, keep. The label stays real HTML above the art, on an opaque card.
- `shaders.ts` + `renderer.ts`: WebGL2. A bake pass draws both words' signed distances into R8 textures once (the
  GLSL comes from the same glyph data as the tests, `glslWord`); then one full-screen pass sphere-traces the blades
  in the sculpture's rest frame (max of the volume and the bands: two texture taps per step; a rigid motion keeps the
  field a true bound, and every step subtracts the most the 8-bit, bilinearly filtered fields can overstate a
  distance, 0.0043 cap heights, so no blade is stepped over), shades the room's analytic planes, traces a soft shadow
  toward each lamp through the sculpture's box only, and adds the glass block's Fresnel faces and bright edges (the
  glass casts nothing).
- `stage.ts` (camera fitted to the art's shape at every reach of the sculpture, with a lens shift), `motion.ts`
  (follow spring, lean against acceleration, idle wander, lamps, glaze sweep, exit), `controller.ts` and
  `quality.ts` (copied unchanged from Singularidade), `main.ts` (lifecycle). The pure modules are unit-tested in
  `tests/duas-sombras.test.mjs` and `tests/covers.test.mjs`.

## Interaction and lifecycle
Birth (~2.6 s): the left lamp lights "IA", then the right one "DIA"; a glaze highlight runs along the blades. The
words are readable from their first lamp on. The pointer (or a dragging finger) moves the block within ±0.5 cap
heights along the walls' diagonal and ±0.3 in height; a hanging block leans at most ~3.4° against its acceleration,
because beyond ~4° both shadows smear into dark blocks (seen in the prototype). After 3.5 s without input it wanders
slowly. Exit (0.7 s, independent deadline 0.95 s): the lamp on the clicked side (keyboard: both) becomes a point
light rushing toward the block, the shadows swell (at most 0.27 cap heights, inside the range the baked fields store)
until the strokes meet, the label fades, the frame goes dark; a second activation and Escape enter at once, and so
does any activation that begins on a still frame. Without input the art drops to 30 fps after 20 s and keeps a still
frame after 2 min until the next input; nothing is drawn while hidden. A device that stalls or stays too slow keeps
the finished composition (both words lit), also after a resize or Back. Back from the magazine (bfcache) restarts the
birth; leaving for good frees the GPU resources. Reduced motion (also when switched on while the page is open): one
still frame of the finished composition, entry at once; forced colours switched on: the HTML cover.

## Performance and memory
Measured with the prototype on the owner's Intel HD 620 (synchronous read-back timing, 2026-10-23): 6.8 ms per frame
at 0.37 MP for this scene. The canvas is drawn at `scale` of its CSS size × pixel ratio (0.35–1, steered by frame
intervals as in Singularidade; ≤ 2.5 MP at full scale; DPR ≤ 2) and scaled up by CSS. Textures: two R8 word fields
(≈ 1.1 MB). Bundle: 11 KB of JS and 1.6 KB of CSS gzipped (2026-10-23 build), plus the shell's 0.7 KB of CSS.

## Accessibility
The museum label is the content, in the accessibility tree and on an opaque card (contrast in `cover.css`); the room
(poster and canvas) is `aria-hidden`. Keyboard: Tab reaches the skip link, the cover link and the fine print; Enter,
Space or Escape from the page enter; no single-character shortcuts. A drag moves the sculpture instead of entering;
pinch zoom stays where supported.

## References
- N. J. Mitra, M. Pauly, "Shadow Art", ACM Transactions on Graphics 28(5), SIGGRAPH Asia 2009,
  https://www.graphics.stanford.edu/~niloy/research/shadowArt/shadowArt_sigA_09.html (cited by Codex's concept;
  read 2026-10-17). The two-mask construction here is the classic one (D. Hofstadter's "trip-let" on the cover of
  *Gödel, Escher, Bach*, 1979); the band cut and its coverage bound are this cover's own.
- I. Quilez, soft shadows by sphere tracing, https://iquilezles.org/articles/rmshadows/ (the `k·h/t` estimate; read
  2026-10-23). The code here is original.

## Reuse
The folder is self-contained: copy it, render `Cover.astro` inside a page whose `<html>` carries
`data-cover="duas-sombras"` (or rename the scope). `sculpture.ts` works for any two words that share a full-height
stroke on every row; change the glyph data and the placement in `ORIGIN`.

## Acceptance (fill in at each change)
- 2026-10-23, prototype in Chrome 152 on the owner's Intel HD 620 laptop (1280×633, DPR 1): 60 fps; both shadows
  crisp; the lean beyond ~4° smears them (hence the limit).
- 2026-10-23, production build on the same laptop with the session locked (screenshots impossible; frame read back
  from the canvas): live after the verified first frame, both words lit and crisp, at the minimum scale the locked
  session allows; after the review fixes, a resize while the stalling session kept a still frame redrew the finished
  composition (530×356 canvas). Codex's code review (same evening) fixed before commit: field-error margin in the marcher, still
  frames after resize/Back, preference changes, departure, lit calibration, still-frame entry, hint and focus
  contrast, swell range, phase rounding.
- Real-GPU look with the screen on (motion, steering, exit) and on the phone: pending, by the owner.
