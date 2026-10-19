# Weekly Visual Concept — Claude (Codex Optional Critique)

Run as a development task in this repository; follow the theme contract in `docs/VISUAL_LAB.md`.

Run on Fridays. Develop at most ONE new public-site UI experiment for the current ISO week (the week this Friday belongs to). Search for inspirational interaction design with attributable URLs and dates; do not blindly clone copyrighted or closed-source designs. There are no aesthetic restrictions on the experiment: bold or minimal, light or dark, cinematic, 3D, procedural, shaders or sober editorial are all allowed.

Deliver a concise concept brief: unique interaction, visual identity, complexity, tech choices (prefer existing Astro/React stack), performance budget, accessibility/reduced-motion fallback, mobile experience, plan for retaining reading clarity, implementation file boundaries, reusable export components, and links to inspirations. A baseline minimal dark theme MUST remain unchanged. The public switcher has exactly three slots: baseline, previous week, current week (default). Every older theme is archived and reconstructable by code and Git ref.

Start with `npm run theme:rollover -- --week <this ISO week> --title "<name>"` (it replaces the current slot — the fixed slot, Broadsheet, stays — archives the old current with its Git ref and scaffolds the package; `docs/VISUAL_LAB.md`), and finish with `npm run e2e`, reviewing the screenshots in `test-results/screenshots/<id>/`.

Codex may provide a single independent concept critique and alternative. Claude makes final implementation decisions only within quality gates. Do not add a new theme if one for the week already exists.
