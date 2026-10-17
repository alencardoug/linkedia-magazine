# Firebase Hosting and GitHub CI/CD

## Hosting choice
Use **classic Firebase Hosting**, not Firebase App Hosting. Astro outputs static `dist/` files and the global CDN serves those files. No container, Cloud Run, Postgres, or generated AI content at request time. Spark has a no-cost tier with usage limits; monitor bandwidth/storage, and avoid surprise enabling of Blaze/chargeable GCP services.

## Name / project binding
The requested canonical URL is `https://linkedia.web.app`. It works **only after** an authenticated `linkedia` Hosting site ID is successfully reserved (globally unique). Failure to fetch a URL or a missing DNS record is not proof of availability. Since 2026-10-15 new Firebase projects get no default Hosting site and the first site created becomes the permanent default: create `linkedia` with `firebase hosting:sites:create linkedia` as the very first step in a new project, before enabling any other Firebase product (enabling Auth auto-creates a project-named default site), and bind the correct Firebase target/site in the checked-out public repo. The default project ID and site ID may differ, so do not assume they are identical. Domain `linkedia.com.br` is separate and may incur registrar charges.

## Current binding (2026-10-15)
Project `linked-ia` (the project ID `linkedia` was taken). `firebase projects:create` auto-created a default site `linked-ia` (unused), so the claim above about no default site did not hold for CLI-created projects; site `linkedia` was created next. `firebase.json` pins `hosting.site: "linkedia"` and `.firebaserc` sets the project, so a deploy can never land on the default site.

CI (`.github/workflows/deploy.yml`) deploys without any stored credential: the `deploy` job (push to `main` only) exchanges its GitHub OIDC token through Workload Identity Federation (pool `github`, provider `linkedia-magazine`, condition: this repository, `refs/heads/main`, `push`) for the service account `github-deploy@linked-ia.iam.gserviceaccount.com`, whose only project role is `roles/firebasehosting.admin`. This replaces `firebase init hosting:github`, which would store a long-lived JSON key as a repository secret. The `build` job (PRs and pushes) has `contents: read` only and is the required status check on `main`. The `e2e` job (1B-04, same triggers and permissions) builds `content/examples` and runs the Playwright smoke suite against `firebase emulators:start --only hosting --project demo-linkedia` (`firebase-tools@15.34.0` via npx, as in `deploy`; the `demo-` id needs no login); `deploy` needs both jobs.

## Initial setup (historical checklist)
1. Create/select Firebase project with Spark plan; verify classic Hosting and exact site ID.
2. Install/authenticate Firebase CLI (`firebase login`) on the owner's machine.
3. `firebase init hosting` in public repo; configure `dist` as public directory, with build producing static pages. Use multi-site targets if project's default ID differs.
4. `firebase init hosting:github` to create GitHub CI deployment integration, with GitHub secret managed by CLI; review workflow permissions.
5. Ensure main-branch build validation succeeds before live deployment. PR previews optional.
6. Verify deployed URLs, headers, rewrite strategy and no production data leaks. Enable budget/usage notifications if ever on a billing plan.

Do not store service account JSON in tracked files. Keep the setup generated GitHub secrets out of any human-visible issue comment. GitHub Actions (Node 24) runs `npm ci`, content validation, tests and `npm run build`, then the Firebase deploy action, only on `main`.

## Static link paths
Prefer actual per-article and per-edition HTML emitted by Astro, preserving direct URLs without client-side SPA rewrite requirements: Astro `build.format: 'file'` + `trailingSlash: 'never'`, Firebase `cleanUrls: true` + `trailingSlash: false`; verify with the Hosting emulator (task 1B-03). Keep immutable historical permalinks. Cache only Astro's fingerprinted `/_astro/**` assets as immutable; HTML and files from `public/` conservatively.

## Hosting configuration (1B-03)
`firebase.json`, checked by `tests/firebase.test.mjs`:
- `cleanUrls: true` + `trailingSlash: false`, no rewrites (no SPA fallback). Unknown paths get `dist/404.html` (`src/pages/404.astro`) with status 404.
- Headers on every path: `Content-Security-Policy` (`default-src 'none'`; scripts, styles, images, fonts and manifest from `'self'` only; `base-uri`/`form-action`/`frame-ancestors 'none'`; no `unsafe-*`), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy`. Firebase adds HSTS itself (`max-age=31556926; includeSubDomains; preload`, seen live 2026-10-17).
- The CSP works because the build emits no inline CSS or JS: `astro.config.mjs` sets `build.inlineStylesheets: 'never'` and `vite.build.assetsInlineLimit: 0`, so the copy-button script is a file in `/_astro/`; `tests/build.test.mjs` fails on any inline `<script>`, `<style>` or `style=`. An image host added to `IMAGE_HOSTS` must also go into `img-src` (test). The one exception is the pre-paint theme script (1C-01, emitted only once a lab theme exists): its `sha256-…` hash is in `script-src` and `tests/firebase.test.mjs` recomputes it from `src/lib/theme-init.ts`.
- Cache: exactly one `Cache-Control` per path. `/_astro/**` (fingerprinted) `public, max-age=31536000, immutable`; everything else (regex `^/(?:[^_].*)?$`: HTML, clean URLs, `404.html`, root files) `public, max-age=300, s-maxage=86400` — browsers recheck within 5 minutes, and the CDN copy is purged by every deploy. Before this, Firebase's default was `max-age=3600`.

Since 3-01 `/` is the cover pre-page and the edition home is `/revista`; `/capas` and `/capas/<slug>` are static pages like the others (emulator, 2026-10-17: all 200, `/capas/nao-existe` 404).

Emulator check (2026-10-17, firebase-tools 15.28.2, `firebase emulators:start --only hosting --project linked-ia` on a build of `content/examples`): `/`, `/edicoes`, `/edicoes/2026-10-14`, `/materias/exemplo-de-materia-linkedia`, `/categorias/engenharia-de-ia`, `/sobre` → 200 with no redirect; `/materias/<slug>.html`, `/materias/<slug>/`, `/edicoes/` and `/index.html` → one 301 to the clean URL, then 200 (no loop); `/nao-existe` and `/materias/nao-existe` → 404 with the pt-BR page; headers as above. In Chrome the article page loaded its CSS and script with no CSP violation and the copy button worked.

## Deployment control
The private engine pushes approved public content to the public repo; only the public repo's CI/CD has production Firebase credentials. CI failure must not mark local runs as published. Store URL and commit SHA in local publish history. Deploy after commit on `main`, no second content-approval click required once user-selected articles pass gates.
