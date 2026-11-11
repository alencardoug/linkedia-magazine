# Micélio — cover of 2026-W46

The third weekly cover (proposal P2 of the 2026-11-11 brainstorm, the owner's pick over the queue; prototype tuned
and approved by the owner on 2026-11-11). A living organism grown on the reader's device: up to 128,000 blind agents,
like the slime mould *Physarum polycephalum*, each sensing three points ahead, turning toward the strongest trail,
stepping and depositing. Together they find the letters of **LinkedIA**, write the name with their veins and join the
edition's three lead headlines with a transport network. The pointer or the finger is food: while someone steers it,
the veins rush to it and tear the name apart near it (the owner: "Tudo bem não ficar legível muitas vezes"). On a
click, tap or Enter the food goes away, the whole organism runs to the tap and a white wipe from there opens
`/revista`. Everything is code written by AI: no image, no library, no model at run time.

## The organism
The plain rule (Jones 2010) collapses on this hardware into a few thick ropes that leave the letters, so the prototype
departs from it in four ways, all frozen in `motion.ts` (`SIM`):
- Agents are **hungry or fed**. A hungry agent on food may start a meal (`leave`, per step); a fed one ignores food for
  `fed` steps and wanders the network, so the letters keep both a stable fill and traffic between them.
- The **sensed field is flat on food** (trail capped at `cap`, food added as a constant), so agents spread over a
  letter instead of piling on its centre line.
- **New dust germinates on uneaten food** (`respawn`): parts of letters nobody visits are re-seeded.
- The trail is about **0.6 megatexel whatever the window's shape** (`trailSize`), so a letter stroke stays ~25 texels
  wide and the look does not change between a phone and a wide screen.

Food is an R8 texture painted with Canvas 2D: the masthead (one line, 74% of the width at 45% of the height; two lines,
"Linked / IA", in tall windows) and one soft disc under each headline's node, its radius from the reading time
(`discRadius`). The pointer is a moving food point: idle, weight 2 and a weak far field (0.3), wandering on its own
after 4 s; while steered (`ptr.act` 0 → 1, back at 0.5/s after 4 s idle) weight 4, far field 0.8 and a pull every
agent feels, fed or on the letters (`hunger · exp(−d / (hungerReach · r))`). Each edition seeds the agents' first
positions and headings (`editionSeed`: FNV-1a of the date and the headlines).

## What runs
- `Cover.astro` + `cover.css`: the complete HTML cover — kicker, the masthead in the middle, the work and its caption
  with the edition date, the three lead headlines with their nodes, the hint and the viewport-wide link — over a flat
  CSS poster (a dim glow of the organism's ramp on the night). It is what devices without JS or WebGL2, or with
  forced colours, keep. With the art live the organism writes the masthead, so the `h1` turns transparent but stays
  in the accessibility tree; the other text stays real HTML above the canvas, with a shadow of the night.
- `shaders.ts` + `renderer.ts`: WebGL2. One agent per vertex, updated with transform feedback (two ping-pong
  buffers); agents are drawn as points that deposit additively into an RGBA16F trail; a full-screen pass diffuses and
  decays it (and a slow, wide "ghost" channel for the halo and afterimage); one full-screen pass shows it through the
  colour ramp (#05030a → #3b0f6b → #ff4d6d → #ffe9a8). Needs `EXT_color_buffer_float`; a software renderer is
  refused.
- `motion.ts` (frozen constants, sizes, seed, exit schedule), `controller.ts` and `quality.ts` (copied unchanged
  from Duas sombras), `main.ts` (lifecycle). The pure modules are unit-tested in `tests/micelio.test.mjs` and
  `tests/covers.test.mjs`.

## Interaction and lifecycle
Birth: dust everywhere; within a few seconds the veins find the letters and the headline nodes. Agents start at
32,000 and double while frames stay fast, up to the cap (22% of the trail texels; 128,000, or 64,000 on a coarse
pointer). Exit (**3 s, the owner's exception to the ~1 s rule**, 2026-11-11; independent deadline 3.25 s): the food
and the masthead fade over the first 36%, every agent turns hungry and runs to the tap (narrower sensor angle, longer
steps, faster decay), the text fades in 0.8 s and a white wipe from the tap covers the last 36%; a second activation and
Escape enter at once, and so does any activation that begins on a still frame. The live hint is longer than the HTML
one, so the food is repainted under the nodes once it is shown (`refood`). Without input the art drops to 30 fps
after 20 s and keeps a still frame after 2 min until the next input; nothing is drawn while hidden. A device that
stalls or stays too slow keeps the grown picture. A resize builds a new sheet; Back from the magazine (bfcache) too;
leaving for good frees the GPU resources. Reduced motion (also when switched on while the page is open): one still
frame, 240 silent steps then one draw, entry at once; forced colours switched on: the HTML cover.

## Performance and memory
Measured in the prototype on the owner's Intel HD 620 (2026-11-11): 128,000 agents at 60 fps; dragging peaks around
28 ms per frame. The canvas is drawn at `scale` of its CSS size × pixel ratio (adaptive, as in the other covers;
≤ 2.1 MP at full scale; DPR ≤ 2). GPU memory: two RGBA16F trails (≈ 9.6 MB at 0.6 megatexel), two agent buffers
(4 MB at 128,000 agents), the R8 food with mipmaps (≈ 0.8 MB). Bundle: 9.3 KB of JS and 1.6 KB of CSS gzipped
(2026-11-11 build), plus the shell's 0.7 KB of CSS.

## Accessibility
The text is the content, in the accessibility tree (contrast in `cover.css`: ink 18:1 on the night, 12.7:1 on the
poster's brightest point); the room (poster and canvas) is `aria-hidden`. Keyboard: Tab reaches the skip link, the
cover link and the fine print; Enter, Space or Escape from the page enter; no single-character shortcuts. A drag feeds
the organism instead of entering; pinch zoom stays where supported.

## References
- J. Jones, "Characteristics of pattern formation and evolution in approximations of Physarum transport networks",
  Artificial Life 16(2), 2010 (the sense–turn–step–deposit agent model).
- Sage Jenson, "Physarum", 2019 (the GPU rendition and its look).
  The hungry/fed agents, the flat field on food, the germination and the hungry pointer are this cover's own.

## Reuse
The folder is self-contained: copy it, render `Cover.astro` inside a page whose `<html>` carries
`data-cover="micelio"` (or rename the scope). Food is any Canvas 2D drawing (`paintFood`): another word, shapes, nodes.

## Acceptance (fill in at each change)
- 2026-11-11, prototype in Chrome on the owner's Intel HD 620 laptop: approved by the owner ("Aprovado. Publique. Só
  mude 0,7 segundos para 3 segundos"), then the hungrier pointer at their request; contact sheets before and after in
  the engine's `ideas/micelio-2026-11-11/sheets/`.
- 2026-11-11, production build (`astro preview`) in headless Chrome on the same HD 620 (`--use-angle=gl-egl`): live
  after 0.4–0.8 s at 1366×768, 844×390, 390×844 and 320×568 (touch); the name written, veins between the nodes, the
  pointer tearing the name; the click enters `/revista` after 3.1–3.2 s; no page errors. Fixed then: the nodes moved
  under the longer live hint on small portrait screens (now `refood`).
- 2026-11-11, live at https://linkedia.web.app (deploy `308e57b`, CI green): approved by the owner after trying it
  ("Testei na linkedia e estava lindo, ótimo, aprovado."). Headless Chrome on the HD 620 against the live site: CSP
  served, live in 0.8–1.3 s, 60 fps (median 17 ms), `data-leaving` on the click and `/revista` after 3.2–3.4 s; once,
  a cold first load in a freshly opened browser kept the HTML cover (the start-up calibration timed out: the designed
  fallback).
