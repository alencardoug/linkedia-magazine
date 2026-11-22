# Shared Quality Gates

## Build gates
- API contracts: JSON schema fixtures validate; incompatible changes require `schema_version` increment.
- Engine: Python static checks, unit tests for dedup/tags/prompt versioning, integration test with local Postgres, deterministic mock CLI adapter and HITL resume test.
- Magazine: Astro build, article/edition direct-route smoke tests, clipboard interaction, missing-source and malformed-image tests, accessibility and responsive reading modes.
  - As built (1B-04): `npm test` (Vitest: contracts, content validation, reading modes, firebase.json, static build with hostile content) and `npm run e2e` (Playwright + axe in Chromium against the Hosting emulator on `content/examples`: every route 200 with no redirect, CSP header and no console/CSP errors, 404 page, one-hop redirects of `.html`/trailing slash, copy button with clipboard permission, full article and prompt without JS, no horizontal scroll at 320 px, no serious/critical axe violation). CI runs both; `deploy` needs `build` and `e2e`.
  - Covers (3-01, `docs/COVERS.md`): `tests/covers.test.mjs` (registry, entry gestures, motion, adaptive quality) and `tests/build.test.mjs` (cover pages: own shell, skip link, viewport-wide link to `/revista`, fine print, only their own script; reading pages load no cover code) in `npm test`; `e2e/cover.spec.mjs` in `npm run e2e` (headless has no WebGL, so the HTML cover: click anywhere, Enter/Space/Escape, no letter shortcuts, skip link, drag is not a tap, Back, a broken WebGL context, the archive, 320 px, axe, and the painted bitmap matching the HTML via `#pintura`); the art itself is accepted on a real GPU and recorded in the cover's README.
  - Reading modes (V2-06, `docs/VISUAL_LAB.md`): `tests/mode.test.mjs`, the mode checks of `tests/build.test.mjs` and `tests/firebase.test.mjs` in `npm test`; `e2e/modes.spec.mjs` in `npm run e2e`, on the single e2e build (`npm run e2e:build`: `content/examples` + the v2 fixture merged by `scripts/ci/e2e-content.mjs`; every browser suite, the v2 fast-path smoke included, runs on it): no flash (first frame and a screenshot pixel), button by keyboard and screen reader, system changes, invalid/blocked storage, other tabs, no JS, covers and specials untouched, and axe + 320 px + layout shift on every kind of reading page in each of the three modes. Screenshots land in `test-results/screenshots/<mode>/` (CI artifact `mode-screenshots`, 14 days) for human review; they are not pixel baselines. The weekly-theme suites (1C-01 fixture themes, 1C-03 `e2e:themes` on the production build) are retired with the themes.
- Publish: exported files contain no secrets, local absolute paths, raw prompts or unapproved candidates; git diff review shows only expected public paths; Firebase production action runs from authorized branch only.

## Editorial gates
Source provenance, factual uncertainty, proper date/timezone, anti-dup, `pt-BR` editorial quality, clear learner benefit, at least one copyable deep-dive prompt, meaningful tags and accessible visuals. Reject a failing article while safely preserving the run and permitting other selected valid articles to publish if configured.

## Cost gates
CLI preflight required; no direct paid API calls. Use and report per-run call caps. Review is zero or one pass only unless a user explicitly overrides. Persist prompts and retrieval caches for controlled reuse. If quota exhaustion or hidden billing risk occurs, stop and keep journalled state.

## Visual gates
Three reading modes (light and dark from the system, black only on request; V2-06, D-081) with no flash and AA contrast in each, covers with their own palette, reduced motion, screen-reader and keyboard support, graceful performance and media fallback.
