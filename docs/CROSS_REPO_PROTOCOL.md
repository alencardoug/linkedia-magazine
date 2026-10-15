# Private Engine → Public Magazine Contract

Identical copy in both repositories. Decisions: D-023 (publish clone), D-024 (direct push to `main`), D-025 (themes), D-029 (contracts).

## Directory boundaries
Sibling checkouts under one workspace: `linkedia-engine/` (private), `linkedia-magazine/` (public, development checkout) and `linkedia-magazine-publish/` (a clean clone used **only** by the engine to publish). `PUBLIC_REPO_PATH` points to the publish clone and is never committed with a machine-specific absolute path. The public build never reads the engine, its DB or its config.

## Data exchange
The engine assembles an edition in `staging/<YYYY-MM-DD>/` (outside every repo checkout), validates it, then copies an approved snapshot into the publish clone:

```
content/editions/YYYY-MM-DD.json      (contracts/public/edition.schema.json)
content/articles/{article_id}.json    (contracts/public/article.schema.json)
content/tags/catalog.json             (contracts/public/tag_catalog.schema.json)
contracts/*.schema.json               (verbatim copy of the engine's contracts/public/)
```

Files are canonical JSON: UTF-8, sorted keys, 2-space indent, trailing newline. Article ids are stable UUIDs; slugs are sanitized, unique and immutable once exported. Source URLs, attributions, alt texts and long descriptions are public. Never exported: internal preferences, rejected candidates, cost/usage logs, raw prompts, model output before enrichment, uncertainties notes, session identifiers, traces, unpublished article bodies, credentials, absolute local paths.

Themes are not part of the export: the magazine owns `themes/manifest.json` and theme code; the engine only reads `current_theme_id` from that manifest to stamp `edition.visual_theme_id`.

## Publishing transaction
1. Generate and gate the selected articles in the engine; only `validated` articles proceed.
2. Write the snapshot to staging; validate schemas, cross-references, language, disallowed HTML/JS, image-host allowlist, dedup state; run the leak scanner.
3. Preconditions on the publish clone: clean working tree, branch `main`, `git pull --ff-only` when a remote exists; take a file lock (`fcntl`) for the whole transaction.
4. Copy files; `git add` only `content/**` and `contracts/**`; if nothing changed, stop (idempotent rerun).
5. Commit `content: edition YYYY-MM-DD (run <first 8 chars of run id>)` when `PUBLISH_ENABLED=true`; push to `origin main` only when `GIT_PUSH_ENABLED=true`.
6. GitHub Actions validates, tests, builds and deploys to Firebase. The engine records commit SHA, push result and CI status (`gh run list`) in `publication_events`. Network or CI failure leaves the run in `exported`/`publish_pending`; retries (`make publish`) are idempotent and never regenerate content.

The development checkout pulls content commits from GitHub like any other commit. A manual edit of public content goes through a reviewed PR and does not flow back into the engine DB; prefer engine-side corrections for published articles.

## Canonical metadata
`schema_version`, `edition_date` (America/Sao_Paulo), `channel`, namespaced tags from the catalog, sources with canonical HTTPS URLs and dates, `editorial_metadata` (content version, generation time, `ai_generated`, model when reported, opaque `run_ref`, `supersedes_article_id`), edition `visual_theme_id`.

## Safety invariant
No credentials, absolute local paths, hidden reasoning or private transcripts may ever be exported. The public build may not fetch the private DB or start the Python engine. Only the public repo's CI holds Firebase deploy credentials.
