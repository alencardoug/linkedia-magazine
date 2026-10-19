# Singularidade — cover of 2026-W42

The first weekly cover (task 3-01, chosen by the owner on 2026-10-17 over three Codex concepts). A black hole,
simulated in real time with general relativity, bends the light of a typographic magazine cover: it is born on the
"IA" of the masthead, follows the pointer or the finger, wanders on its own when nobody steers it, and on a click,
tap or Enter grows until it swallows the screen — "atravesse o horizonte de eventos" — before `/revista` appears.
The pun is the AI singularity as a literal one. Everything is code written by AI: no image, no library.

## What runs
- `Cover.astro` + `cover.css`: the complete HTML cover (kicker, masthead, edition date, three lead headlines, the
  hint and the viewport-wide link). It is what devices without JS or WebGL2, or with forced colours, keep.
- `snapshot.ts`: paints the `data-ink` text into a Canvas 2D bitmap at the positions the browser laid it out (Range
  rects, computed font, colour, opacity; `--ink-rule`, `--ink-from`/`--ink-to`), so the first WebGL frame matches the
  HTML. `#pintura` shows that bitmap flat (fidelity check in `e2e/cover.spec.mjs`).
- `shaders.ts` + `renderer.ts`: WebGL2. Per pixel, one light ray is integrated from the camera through the hole's
  gravity to the plane of the cover, crossing the accretion disk; then a small bloom chain and the composite.
- `motion.ts` (birth, spring, wander, ripple, exit), `quality.ts` (adaptive resolution), `controller.ts` (what clicks,
  taps and keys do), `main.ts` (lifecycle). The pure modules are unit-tested in `tests/covers.test.mjs`.

## Physics (and where it is approximate)
- Units of Schwarzschild radii (r_s = 2GM/c²): horizon r = 1, photon sphere 1.5, innermost stable orbit 3.
- Light follows the Schwarzschild orbit equation d²u/dφ² + u = 3Mu², integrated in Cartesian form as
  a = −(3/2)·h²·r⃗/r⁵ with h = |r⃗ × v⃗| conserved (the trick of rantonels' "Starless"), with steps proportional to
  the distance, up to 220 per pixel. This bends the path exactly; the cover sits on a plane 22 r_s behind the hole and
  the camera 30 r_s in front, which is a staging choice, not physics.
- Thin disk from r = 3 to 12, Keplerian shear, Shakura–Sunyaev-like temperature profile; observed shift
  g = √(1 − 1/r)·√(1 − β²)/(1 − β cos θ) with β = √(0.5/r), and brightness ∝ g³ (Doppler beaming makes the approaching
  side burn). The palette is artistic, not a blackbody.
- The gravitational-wave ripples at birth and exit are an artistic displacement of the cover, not a simulation.

## Interaction and lifecycle
Birth on "IA" (~2.9 s; the disk lights up after the lensing starts) → follow the pointer or finger with a spring →
after 3.5 s without input, a slow Lissajous wander around the masthead → exit: the hole rushes to the click point and
grows (0.9 s) under an independent deadline; a second activation enters at once; Escape skips. Without input the art
drops to 30 fps after 20 s and keeps a still frame after 2 min until the next input; nothing is drawn while hidden.
Back from the magazine (bfcache) restarts the birth. Reduced motion: one still frame, entry at once.

## Performance and memory
Scene at 0.35–1× the canvas, starting near 0.5 MP and steered by frame intervals (down after 0.7 s under ~42 fps, up
after 3 s at vsync; a still frame after 2 s under ~22 fps at the minimum). Canvas ≤ 2.5 MP and DPR ≤ 2; cover bitmap
≤ 3 MP (≈ 16 MB with mipmaps on the GPU); half-float targets when the device can render to them, 8-bit otherwise.
Bundle: about 10 KB of JS and 2 KB of CSS gzipped.

## Accessibility
The HTML stays in the accessibility tree (its ink is only made transparent while the art shows it); the canvas is
`aria-hidden`. Keyboard: Tab reaches the skip link, the cover link and the fine print; Enter, Space or Escape from the
page enter; no single-character shortcuts. A drag steers instead of entering; pinch zoom stays where supported.

## References
- J.-P. Luminet, "Image of a spherical black hole with thin accretion disk", Astronomy & Astrophysics 75, 228 (1979).
- O. James, E. von Tunzelmann, P. Franklin, K. S. Thorne, "Gravitational lensing by spinning black holes in
  astrophysics, and in the movie Interstellar", Classical and Quantum Gravity 32, 065001 (2015).
- N. I. Shakura, R. A. Sunyaev, "Black holes in binary systems. Observational appearance", A&A 24, 337 (1973).
- R. Antonelli (rantonels), "Starless" black hole ray tracer, https://rantonels.github.io/starless/ (the Cartesian
  form of the photon orbit equation; read 2026-10-17). The code here is original.

## Reuse
The folder is self-contained: copy it, render `Cover.astro` inside a page whose `<html>` carries
`data-cover="singularidade"` (or rename the scope), and give the masthead element `data-anchor`. Without Astro, keep
the HTML and CSS and call `boot()` from `main.ts`.

## Acceptance (fill in at each change)
- 2026-10-17, prototype in Chrome 152 on an Intel HD 620 laptop (1366×593, DPR 1): 60 fps at 1025×445 scene pixels.
- 2026-10-19, live https://linkedia.web.app/ checked by the owner on the Intel HD 620 laptop and on their phone (finger steering, tap to enter): "Todas funcionaram perfeitamente".
