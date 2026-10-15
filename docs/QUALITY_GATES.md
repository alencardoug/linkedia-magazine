# Shared Quality Gates

## Build gates
- API contracts: JSON schema fixtures validate; incompatible changes require `schema_version` increment.
- Engine: Python static checks, unit tests for dedup/tags/prompt versioning, integration test with local Postgres, deterministic mock CLI adapter and HITL resume test.
- Magazine: Astro build, article/edition direct-route smoke tests, clipboard interaction, missing-source and malformed-image tests, accessibility and responsive theme fallback.
- Publish: exported files contain no secrets, local absolute paths, raw prompts or unapproved candidates; git diff review shows only expected public paths; Firebase production action runs from authorized branch only.

## Editorial gates
Source provenance, factual uncertainty, proper date/timezone, anti-dup, `pt-BR` editorial quality, clear learner benefit, at least one copyable deep-dive prompt, meaningful tags and accessible visuals. Reject a failing article while safely preserving the run and permitting other selected valid articles to publish if configured.

## Cost gates
CLI preflight required; no direct paid API calls. Use and report per-run call caps. Review is zero or one pass only unless a user explicitly overrides. Persist prompts and retrieval caches for controlled reuse. If quota exhaustion or hidden billing risk occurs, stop and keep journalled state.

## Visual gates
Exactly 3 visible theme slots once the first experiment exists (bootstrap rule D-025), baseline invariant, previous/current rotation, current default, one weekly experiment, old theme recoverability, reduced motion, screen-reader and keyboard support, graceful performance and media fallback.
