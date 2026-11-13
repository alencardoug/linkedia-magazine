# Sismograma — cover of 2026-W47

The fourth weekly cover and the first one drawn with Canvas 2D (proposal P10 of the 2026-11-11 brainstorm, written
from the owner's own brief: "uma escultura digital de linhas que pareça viva e sensível ao toque, mantendo o caráter
visual de um gráfico científico antigo"; built ahead of its week at the owner's request on 2026-11-13). A sheet from
an old pen plotter: beige paper with scanlines and grain, 15 to 25 thin parallel lines in black, dark purples and
magenta, two cyan measuring markers and a column of monospaced codes on the right. The lines breathe on their own,
rise in relief to write **IA**, open like an eye under the pointer, carry the ring of a long press and the trail of a
drag, and always come back. On a click, tap or Enter a strong ripple leaves the tap, the sheet is erased outward from
it and `/revista` opens. Everything is code written by AI: no image, no library, no model at run time.

## The sheet
- **Lines.** `15 + articles of the edition` (at most 25), evenly spaced inside the plot — the box between the header
  and the headlines, measured from the DOM, with ¾ of a spacing free above and below (`rows`). One point every 8 px
  (up to 16 px on a slow device), joined by quadratic curves through the midpoints, one path per ink. The edition
  seeds the inks (`lineInks`), the codes (`lineCode`: `LK` + the line in hex + four hashed digits; every fifth line
  the ordinal date, `D26313`) and the noise.
- **Breathing** (`breathing`, in spacings): two slow sines with a phase per line, a wide Perlin noise and a fine one
  (the plotter's irregularity), swelling and ebbing every 11 s.
- **Relief** (`RELIEF = 1` in `field.ts`; `0` gives the pure sheet of the brief). "I" and "A" in the heaviest system
  sans are painted on an offscreen mask (capitals 58% of the plot high, at most 70% of the width, centred 6% left of
  the middle), sampled under every point and smoothed along the line. Inside a letter a line rises between 0.35 and
  0.6 of a spacing over 18 s, breathes 45% less and is redrawn in magenta.
- **Lens** (`lens`): each pointer (up to three; a hovering mouse counts) pushes the lines above it up and the lines
  below it down, `B · tanh(dy / 0.25σ) · exp(−r² / 2σ²)`, σ 110 px (90 px on narrow sheets). `B` is about one spacing
  at rest and up to 2.8 times that at 1500 px/s. A line snaps from one side to the other when the pointer crosses
  it, like a plucked string; for `B ≤ 1.2σ` the lines bunch around the eye and never cross (unit-tested).
- **Ripples** (`rippleAt`): a damped wave packet riding a ring at 420 px/s, 3 s of life, at most ten at once. A long
  press launches one of 1.1 spacings; a drag leaves one of 0.45 every 90 px. Their sum passes the soft limit
  (`softLimit`: under 0.95 of a spacing whatever is asked) and is shown directly; 60% of it also pulls on the
  springs, which answer late — the wake behind the ring.
- **Springs** (`springs.ts`): every point has a displacement and a velocity; a damped spring (9 rad/s, ratio 0.55)
  pulls it to its goal and a second one ties it to the same point of the lines above and below, so the lines react to
  each other. Semi-implicit Euler, step capped at 1/30 s.
- **Markers** (`markers.ts`): two cyan lines at 24% and 76% of the width with their position as a readout
  (`A 0.240`); each is a damped spring along x that a pointer within 140 px pushes away and a passing ripple kicks,
  never more than 60 px from rest.
- **Paper** (`paper.ts`, `cover.css`): grain on its own canvas (one random tile, painted once per resize, nudged a
  pixel or two every 140 ms), CSS scanlines and vignette, and a slightly darker band that rolls down every 9 s.

## Tuned away from the proposal (2026-11-13, by eye in headless Chrome)
The proposal's numbers were starting values. Three did not hold on screen:
- The relief lifted 0.8 of a spacing with a wide blur: the lines inside a letter fell back in step with the lines
  outside and "IA" could not be read. Now half a spacing on average, a 10 px blur, calmer breathing inside the
  letters, a gap between the two letters and a wider magenta stroke.
- The lens `∝ dy · exp(…)` barely moved the lines nearest to the pointer. Now `tanh`, which opens a hollow eye.
- Ripples went through the springs, which swallowed them (a 9 rad/s spring against a wave that passes in a tenth of
  a second; the entry ripple was invisible). Now they are shown directly and only their wake goes through the
  springs. Their wavelength grows with the spacing (`rippleWave`) so neighbouring lines stay apart.
Also: the text lives in the margins, so the plot is measured from the DOM instead of fixed 12% margins; the markers
moved from 31%/74% to 24%/76% (the first one ran through the "I"); a pen plots the sheet at birth.

## What runs
- `Cover.astro` + `cover.css`: the complete HTML cover as a lab sheet — kicker, masthead, the work and its caption
  with the edition date and the number of lines, a ruled CSS poster (parallel lines and the two markers), the three
  lead headlines, the hint and the viewport-wide link. It is what devices without JS or Canvas, or with forced
  colours, keep. With the art live the poster leaves and the canvas covers the viewport; all text stays real HTML
  above it, with a halo of paper.
- `field.ts`, `springs.ts`, `markers.ts`, `codes.ts`, `noise.ts`, `pointer.ts`: pure, unit-tested in
  `tests/sismograma.test.mjs`. `draw.ts` and `paper.ts`: Canvas 2D. `controller.ts` and `quality.ts`: copied
  unchanged from Micélio (tested in `tests/covers.test.mjs`); here the quality scale drives the point step, not the
  resolution: the backing store stays at `min(devicePixelRatio, 2)` (at most 6 MP) so hairlines stay crisp.
  `main.ts`: lifecycle.

## Interaction and lifecycle
Birth: a pen plots the lines from left to right, one starting after the other (under 2 s for 25 lines). Mouse: hover
opens the eye, a drag or a long press (0.5 s) launches waves, a click enters. Touch: a drag opens the eye and leaves
waves, a long touch launches a wave, a tap enters. A long press stays on the cover with any pointer (the wave was the
gesture; docs/COVERS.md); a right click keeps the browser's menu, a long touch on the sheet does not open the link's
menu. Entry (0.7 s, independent deadline 0.95 s): a ripple of 2.2 spacings rides the rim of a disc that erases the
sheet from the tap, the markers slide off the sides, the text fades; a second activation and Escape enter at once,
and so does any activation that begins on a still frame. Without input the sheet drops to 30 fps after 20 s and
keeps a still frame after 2 min until the next input (the rolling band stops too); nothing is drawn while hidden.
The owner's brief asks for a sheet that stays animated without interaction: these idle steps are the cover contract,
which only the owner can relax. A device that stalls or stays too slow at the coarsest point step keeps a still
sheet. A resize builds a new sheet; a window where the cover no longer fits returns the HTML cover and a larger one
starts the art again; Back from the magazine (bfcache) plots a new sheet; leaving for good frees the canvases.
Reduced motion (also when switched on while the page is open): one still sheet at the relief's highest, the plain
hint, entry at once; forced colours: the HTML cover.

## Performance and memory
No GPU context: Canvas 2D and typed arrays. At 1366 × 768 with 18 lines: 3,100 points, about 0.1 MB of state; the
canvas is 1 MP (4 MB), the grain 1 MP, the relief mask under 0.2 MB. Bundle: 8.9 KB of JS and 1.7 KB of CSS
gzipped (2026-11-13 build), plus the shell's 0.7 KB of CSS.

## Accessibility
The text is the content, in the accessibility tree (contrast on the paper in `cover.css`: ink 15:1, fine print 7.7:1);
the room (paper, canvases) and the plot's poster are `aria-hidden`. Keyboard: Tab reaches the skip link, the cover
link and the fine print; Enter, Space or Escape from the page enter; no single-character shortcuts. A drag stirs the
lines instead of entering; pinch zoom stays where supported.

## References
- The owner's brief of 2026-11-11 (pen-plotter charts, topographic curves, experimental mathematical plots).
- K. Perlin, "Improving noise", SIGGRAPH 2002 (the coherent noise).
- The stacked-line plots of pulsar CP 1919 (H. Craft, 1970) and pen-plotter art of the 1960s and 70s (the look of
  parallel lines displaced by a signal). The relief by half a spacing, the eye and the pen are this cover's own.

## Reuse
The folder is self-contained: copy it, render `Cover.astro` inside a page whose `<html>` carries
`data-cover="sismograma"` (or rename the scope). The relief is any Canvas 2D drawing (`buildMask` in `main.ts`):
another word or a shape; `RELIEF = 0` removes it.

## Acceptance (fill in at each change)
- 2026-11-13, production build (`astro preview`), bundled headless Chromium and the system Chrome on the owner's
  Intel HD 620 laptop (`--use-angle=gl-egl`), machine under load from other work (load average 6 to 10): live after
  0.3–0.8 s at 1366×768, 1920×1080, 844×390, 390×844 and 320×568; 16.7 ms a frame (median; p95 16.8 ms) at 1366×768;
  the pen, the relief "IA", the eye, the ring of a long press, the trail of a drag and the entry look as intended
  (contact sheets in the engine's `ideas/sismograma-2026-11-13/sheets/`); a mouse long press and a drag stay, a
  click enters `/revista` after 0.85–0.9 s; CDP touch events at 390×844: a drag, a long touch and two fingers stay
  (no scroll), a tap enters after 0.8 s; reduced motion: one still sheet; idle: 30 fps after 20 s, a still frame with
  `data-rest` after 2 min, awake on the next input; no page errors from the cover.
- **Not yet done:** the owner's look in their own Chrome and on a phone (docs/COVERS.md, "Acceptance"); nothing is
  pushed or deployed.
