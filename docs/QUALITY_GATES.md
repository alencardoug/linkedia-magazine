# Shared Quality Gates

## Build gates
- API contracts: JSON schema fixtures validate; incompatible changes require `schema_version` increment.
- Engine: Python static checks, unit tests for dedup/tags/prompt versioning, integration test with local Postgres, deterministic mock CLI adapter and HITL resume test.
- Magazine: Astro build, article/edition direct-route smoke tests, clipboard interaction, missing-source and malformed-image tests, accessibility and responsive theme fallback.
  - As built (1B-04): `npm test` (Vitest: contracts, content validation, themes, firebase.json, static build with hostile content) and `npm run e2e` (Playwright + axe in Chromium against the Hosting emulator on `content/examples`: every route 200 with no redirect, CSP header and no console/CSP errors, 404 page, one-hop redirects of `.html`/trailing slash, copy button with clipboard permission, full article and prompt without JS, no horizontal scroll at 320 px, no serious/critical axe violation). CI runs both; `deploy` needs `build` and `e2e`.
  - Themes (1C-01): the e2e build uses the fixture themes (`tests/fixtures/themes`) so the switcher, fallback and per-slot axe/320 px checks run on every push; the real slotted themes are checked by `prebuild` (scoping, budget, files). Since 1C-03 `npm run e2e` runs a second suite, `e2e:themes` (`e2e/real-themes.spec.mjs`), on the production build (real content, real manifest): every slot on one page of each kind at 1100 and 320 px with no serious/critical axe violation, no horizontal scroll, layout shift < 0.1, switcher visible and no console/page error; under reduced motion no animation exists (before and after scrolling) and no enhancement is fetched; without WebGL the theme stays applied with no fallback and a WebGL enhancement is never fetched. Full-page screenshots land in `test-results/screenshots/<theme>/` (CI artifact `theme-screenshots`, 14 days) for human review; they are not pixel baselines (D-064).
- Publish: exported files contain no secrets, local absolute paths, raw prompts or unapproved candidates; git diff review shows only expected public paths; Firebase production action runs from authorized branch only.

## Editorial gates
Source provenance, factual uncertainty, proper date/timezone, anti-dup, `pt-BR` editorial quality, clear learner benefit, at least one copyable deep-dive prompt, meaningful tags and accessible visuals. Reject a failing article while safely preserving the run and permitting other selected valid articles to publish if configured.

## Cost gates
CLI preflight required; no direct paid API calls. Use and report per-run call caps. Review is zero or one pass only unless a user explicitly overrides. Persist prompts and retrieval caches for controlled reuse. If quota exhaustion or hidden billing risk occurs, stop and keep journalled state.

## Visual gates
Exactly 3 visible theme slots once the first experiment exists (bootstrap rule D-025), baseline invariant, previous/current rotation, current default, one weekly experiment, old theme recoverability, reduced motion, screen-reader and keyboard support, graceful performance and media fallback.
