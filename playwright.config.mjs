// Browser smoke suite (1B-04) against the Firebase Hosting emulator, so clean URLs, the 404 page and the
// headers of firebase.json (CSP included) are the ones production serves. `npm run e2e` builds the examples
// into dist first; the demo- project id keeps the emulator offline (no login, no real project).
import { defineConfig, devices } from '@playwright/test';

const PORT = 5000;

export default defineConfig({
  testDir: 'e2e',
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
