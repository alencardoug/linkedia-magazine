# Firebase Hosting and GitHub CI/CD

## Hosting choice
Use **classic Firebase Hosting**, not Firebase App Hosting. Astro outputs static `dist/` files and the global CDN serves those files. No container, Cloud Run, Postgres, or generated AI content at request time. Spark has a no-cost tier with usage limits; monitor bandwidth/storage, and avoid surprise enabling of Blaze/chargeable GCP services.

## Name / project binding
The requested canonical URL is `https://linkedia.web.app`. It works **only after** an authenticated `linkedia` Hosting site ID is successfully reserved (globally unique). Failure to fetch a URL or a missing DNS record is not proof of availability. Since 2026-10-15 new Firebase projects get no default Hosting site and the first site created becomes the permanent default: create `linkedia` with `firebase hosting:sites:create linkedia` as the very first step in a new project, before enabling any other Firebase product (enabling Auth auto-creates a project-named default site), and bind the correct Firebase target/site in the checked-out public repo. The default project ID and site ID may differ, so do not assume they are identical. Domain `linkedia.com.br` is separate and may incur registrar charges.

## Current binding (2026-10-15)
Project `linked-ia` (the project ID `linkedia` was taken). `firebase projects:create` auto-created a default site `linked-ia` (unused), so the claim above about no default site did not hold for CLI-created projects; site `linkedia` was created next. `firebase.json` pins `hosting.site: "linkedia"` and `.firebaserc` sets the project, so a deploy can never land on the default site.

CI (`.github/workflows/deploy.yml`) deploys without any stored credential: the `deploy` job (push to `main` only) exchanges its GitHub OIDC token through Workload Identity Federation (pool `github`, provider `linkedia-magazine`, condition: this repository, `refs/heads/main`, `push`) for the service account `github-deploy@linked-ia.iam.gserviceaccount.com`, whose only project role is `roles/firebasehosting.admin`. This replaces `firebase init hosting:github`, which would store a long-lived JSON key as a repository secret. The `build` job (PRs and pushes) has `contents: read` only and is the required status check on `main`.

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

## Deployment control
The private engine pushes approved public content to the public repo; only the public repo's CI/CD has production Firebase credentials. CI failure must not mark local runs as published. Store URL and commit SHA in local publish history. Deploy after commit on `main`, no second content-approval click required once user-selected articles pass gates.
