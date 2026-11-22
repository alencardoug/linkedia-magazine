// Browser suites against the Firebase Hosting emulator, so clean URLs, the 404 page and the headers of
// firebase.json (CSP included) are the ones production serves; the demo- project id keeps the emulator offline
// (no login, no real project). `npm run e2e` runs, in turn:
// - e2e:fixtures — one build of the example content: smoke (1B-04), reading modes (V2-06, e2e/modes.spec.mjs:
//   no flash, button, axe and 320 px in the three modes, screenshots), covers, specials and redirects;
// - e2e:content-v2 — the v2 fixture content through the fast-path smoke (V2-05).
// The weekly-theme suites and their production-build run (1C-01/1C-03) are retired (V2-06).
// `npm run e2e:content` (LINKEDIA_E2E=content) runs only the fast-path smoke on an existing production dist
// (V2-01, e2e/content-smoke.spec.mjs; CI's content-only path).
import { defineConfig, devices } from '@playwright/test';

const PORT = 5000;
const SUITES = { content: 'content-smoke.spec.mjs' };
const suite = SUITES[process.env.LINKEDIA_E2E ?? ''];

export default defineConfig({
  testDir: 'e2e',
  ...(suite ? { testMatch: suite } : { testIgnore: Object.values(SUITES) }),
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
