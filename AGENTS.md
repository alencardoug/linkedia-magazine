# Agent Instructions — Linkedia Magazine (public)

Public static reading site for Linkedia, built with Astro and deployed to classic Firebase Hosting. Content arrives as schema-validated JSON exported by the owner's private editorial engine; this repository never calls models, databases or any backend. **This repository is public: write nothing here that must stay private.**

## Every session
Status and tasks for this repository are tracked in the owner's private engine checkout next to this one: read `../linkedia-engine/docs/STATUS.md`, then the NEXT task block in `../linkedia-engine/docs/IMPLEMENTATION_PLAN.md` (P0-05, P0-06, 1B-*, 1C-*), then only the files it lists here. Update that STATUS.md when you finish.

## Rules
- Public UI and content: Brazilian Portuguese (pt-BR). Code, tests, docs, theme names, commits: English.
- Static only: no server, no client-side data API, no analytics, no cookies, no third-party fonts or CDNs.
- Content is data: render every text field escaped; never inject or execute model-produced HTML/JS/JSX; code samples are escaped text.
- `contracts/*.schema.json` are copied from the engine on every export — change them there, not here. Exception: `theme_manifest.schema.json` is owned here.
- The build fails on invalid content (`scripts/validate-content.mjs`, run as `prebuild`).
- Accessibility: keyboard, screen readers, `prefers-reduced-motion`, 320 px layouts, AA contrast; full article reading without JS.
- Themes: `minimal-dark` is the permanent baseline; experiments follow the theme contract in `docs/VISUAL_LAB.md`; the switcher has exactly three slots once experiments exist.
- `content/**` normally changes only through engine commits; manual edits go through a reviewed PR.
- Never commit `.env`, Firebase service-account JSON, tokens, or engine files other than exported content and public contracts.

## Map
`docs/PUBLIC_EXPERIENCE.md` (routes, rendering, transparency) · `docs/VISUAL_LAB.md` (themes) · `docs/ACCESSIBILITY.md` · `docs/DEPLOYMENT.md` · `docs/CROSS_REPO_PROTOCOL.md` · `docs/QUALITY_GATES.md` · `docs/prompts/weekly_visual.md`.
