// Browser suites against the Firebase Hosting emulator, so clean URLs, the 404 page and the headers of
// firebase.json (CSP included) are the ones production serves; the demo- project id keeps the emulator offline
// (no login, no real project). `npm run e2e` makes ONE build (V2-06) and runs two suites on it:
// - e2e:build — scripts/ci/e2e-content.mjs merges content/examples and tests/fixtures/content-v2 into one content
//   dir, then builds dist from it;
// - the default suites: smoke (1B-04), reading modes (V2-06, e2e/modes.spec.mjs: no flash, button, axe and 320 px
//   in the three modes, screenshots), covers, specials and redirects;
// - e2e:content-v2 — the fast-path smoke on the v2 fixture's pages of that same dist (V2-05).
// The weekly-theme suites and their production-build run (1C-01/1C-03) are retired (V2-06).
// `npm run e2e:content` (LINKEDIA_E2E=content) runs only the fast-path smoke on an existing production dist
// (V2-01, e2e/content-smoke.spec.mjs; CI's content-only path).
// LINKEDIA_SKIP_COVERS=1 (V2-06c) leaves out e2e/cover.spec.mjs: CI sets it only when the change classifier proved
// that no cover or shared file changed (scripts/ci/classify-changes.mjs). Any other value runs the covers.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5000;
const SUITES = { content: 'content-smoke.spec.mjs' };
const suite = SUITES[process.env.LINKEDIA_E2E ?? ''];
const skipped = [...Object.values(SUITES), ...(process.env.LINKEDIA_SKIP_COVERS === '1' ? ['cover.spec.mjs'] : [])];

export default defineConfig({
  testDir: 'e2e',
  ...(suite ? { testMatch: suite } : { testIgnore: skipped }),
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx --yes firebase-tools@15.34.0 emulators:start --only hosting --project demo-linkedia`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
