// Browser suites against the Firebase Hosting emulator, so clean URLs, the 404 page and the headers of
// firebase.json (CSP included) are the ones production serves; the demo- project id keeps the emulator offline
// (no login, no real project). `npm run e2e` runs two builds of dist in turn:
// - e2e:fixtures — example content + fixture themes: smoke (1B-04) and switcher/fallback (1C-01) specs;
// - e2e:themes (LINKEDIA_E2E=themes) — the production build (real content, real slotted themes): per-theme
//   axe, 320 px, layout shift, reduced motion, no WebGL and screenshots (1C-03, e2e/real-themes.spec.mjs).
// `npm run e2e:content` (LINKEDIA_E2E=content) runs only the fast-path smoke on an existing production dist
// (V2-01, e2e/content-smoke.spec.mjs; CI's content-only path).
import { defineConfig, devices } from '@playwright/test';

const PORT = 5000;
const SUITES = { themes: 'real-themes.spec.mjs', content: 'content-smoke.spec.mjs' };
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
