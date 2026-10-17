# Weekly Covers

The cover is the pre-page of the magazine (owner's brief: `docs/prompts/cover_art.md`; engine decision D-067). It is
the one place with no aesthetic limits: unlimited technological art, a new one every week, and one click, tap or key
press anywhere enters the magazine. Reading pages keep their themes (`docs/VISUAL_LAB.md`) and load no cover code.

## Routes
- `/`: the current cover (`CURRENT_COVER` in `src/covers/registry.ts`, rendered by `src/pages/index.astro`).
- `/capas/<slug>`: every cover ever published, one static page each (`src/pages/capas/<slug>.astro`), so a page ships
  only its own cover's CSS and JS. Unknown slugs get the 404 page.
- `/capas`: the archive (reading layout): title, week and summary of each cover, newest first; "Capas" in the header.
- `/revista`: the edition home, the target of every cover. It was `/` before 3-01; the header brand and the 404 page
  link to it, so moving inside the site never shows the cover again.

## A cover is a package
`src/covers/<slug>/` holds the cover's Astro component (`Cover.astro`, root marked `data-cover-art="<slug>"`), its CSS
(every selector under `html[data-cover='<slug>']`), its client modules and a `README.md` (concept, techniques and
references with dates, accessibility, fallbacks, budgets, reuse, acceptance evidence). The shell
`src/layouts/CoverPage.astro` wraps every cover: `<html data-cover="<slug>">`, the skip link and the fine print.
`src/covers/registry.ts` lists the covers (slug, title, ISO week, summary, credit, frozen edition) as build-only data:
no client code imports it.

## Contract (every deployed cover, not only the current one)
1. **Entry never depends on the art.** The cover is a real `<a href="/revista">` whose `::after` covers the viewport;
   it works without JS. The shell's visible skip link comes first in the tab order. A middle or modified click keeps
   the browser's behaviour. Enter, Space and Escape from the page enter; no single-character key shortcuts (WCAG
   2.1.4); a focused control (fine print, skip link) keeps its own behaviour. An exit animation may play for at most
   ~1 s under an independent navigation deadline; a second activation enters at once; reduced motion, a fallback or
   a still frame enter at once. A drag, a long touch or a multi-touch never counts as a tap.
2. **The HTML is a complete cover.** Semantic text (one `<h1>`, the edition date and lead headlines as text) that reads
   well without JS, without WebGL, with reduced motion and in forced colours; the art enhances it and hides it only
   after its own first frame is verified (`html[data-art]`), keeping it in the accessibility tree.
3. **Fine print** (shell): the cover's credit, "Outras capas", the AI note, `/sobre` and the editor — all real links
   above the cover's link layer.
4. **Safety floor.** The site CSP is unchanged (same-origin files only: no inline code, no fetch, no workers or wasm
   unless a decision adds them), no third-party requests, no images by default. The art must not lock up a weak
   device: adaptive resolution, a still frame below a frame-rate floor, nothing drawn while hidden, a lower rate and
   then a still frame without input, bounded GPU memory, cleanup on `pagehide`, a fresh state on Back (bfcache).
5. **Budgets.** Client JS ≤ 30 KB gzipped per cover; CSS ≤ 10 KB; GPU textures within a few tens of MB.
6. **Archived covers keep working.** When a cover leaves `/`, set its `edition` in the registry (the edition it
   showed), so it keeps its own headlines; shared code it uses must stay backward compatible (or be copied into it).

## Adding the cover of the week
1. Build the package under `src/covers/<slug>/`, add `src/pages/capas/<slug>.astro` (copy an existing one), add the
   registry entry at the top of `COVERS`.
2. Archive the outgoing cover: set its `edition` to the latest edition date.
3. Point `CURRENT_COVER` and the import in `src/pages/index.astro` at the new cover (`tests/build.test.mjs` checks
   they agree).
4. `npm run check && npm test && npm run e2e`, then the acceptance below. The routine and its prompt:
   `docs/prompts/weekly_cover.md`; the idea queue: `docs/prompts/cover_art.md`.

## Acceptance
Headless Chromium has no WebGL here, so CI (`e2e/cover.spec.mjs`, `e2e/real-themes.spec.mjs`) covers the HTML cover,
entry, drag versus tap, keys, Back, a broken WebGL context, the archive, 320 px and axe, and the fidelity of the bitmap
the art paints from the HTML (`#pintura`). The art itself is accepted on a real GPU: a laptop with an integrated GPU (Intel
HD 620) and a phone — frame rate, look, steering by mouse and finger, entry, resize, Back, a minute of idling. Record the
evidence in the cover's README.
