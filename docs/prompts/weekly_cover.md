# Weekly Cover — Claude (Codex for ideas and critique)

Run as a development task in this repository; follow the cover contract in `docs/COVERS.md` and read the owner's
brief and the idea queue in `docs/prompts/cover_art.md` first.

One new cover per ISO week (owner, 2026-10-17: covers are made weekly and every past cover stays reachable). Take the
next idea of the queue unless the owner names another; anything technological and impressive goes — the cover is the
place where the owner wants to look and think "isso é incrivelmente diferente". Aim for maximum ambition, never a
tasteful default; prototype early in the owner's browser (an integrated GPU: WebGL2, no WebGPU) and show it before building
it into the site. Codex may give divergent ideas and one critique of the plan (read-only, effort as the owner sets).

Deliver: the package `src/covers/<slug>/` (component, scoped CSS, client modules, README with concept, references
with dates, accessibility, fallbacks, budgets, reuse and acceptance evidence), `src/pages/capas/<slug>.astro`, the
registry entry, the outgoing cover archived with its `edition`, `CURRENT_COVER` and the `/` import moved, unit tests
for the cover's pure logic, then `npm run check && npm test && npm run e2e` and the real-GPU acceptance (owner's
Chrome and a phone). Never weaken the contract: entry independent of the art, complete HTML cover, fine print, CSP,
no lock-up on weak devices.
