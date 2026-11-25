// GovernaIA redirect switch (V2-13b) on the Hosting emulator: the old URLs of the AI guide and its showcase answer
// 301 with the new page in `Location`, a browser keeps the fragment across the redirect, and the old `esquema.js`
// (loaded by an old page opened or cached before the switch) is still served with 200 and a JavaScript MIME type.
// The new site is never contacted: its pages are stubbed in the browser.
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { OLD_TO_NEW, ROUTE, SCHEME_SCRIPT, SCHEME_SCRIPT_SHA256, SHOWCASE, SITE } from './fixtures/governaia-urls.mjs';

// A JavaScript MIME type (production serves text/javascript, the emulator application/javascript).
const JS = /^(?:text|application)\/javascript\b/;

test('every old URL redirects (301) to its page on the new site; unknown paths stay 404', async ({ request }) => {
  for (const [from, to] of Object.entries(OLD_TO_NEW)) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(301);
    expect(res.headers().location, from).toBe(to);
  }
  for (const path of [`${ROUTE}/qualquer`, `${SHOWCASE}/extra`]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  }
});

test('the old scheme script is still served, unchanged, as JavaScript', async ({ request }) => {
  const res = await request.get(SCHEME_SCRIPT, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(JS);
  expect(createHash('sha256').update(await res.body()).digest('hex')).toBe(SCHEME_SCRIPT_SHA256);
});

test('a browser keeps the fragment across the redirect', async ({ page }) => {
  await page.route(`${SITE}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>GovernaIA</title><p>novo site</p>' }),
  );
  await page.goto(`${ROUTE}#parte-2`);
  expect(page.url()).toBe(`${SITE}/#parte-2`);
  await page.goto(`${SHOWCASE}#s4`);
  expect(page.url()).toBe(`${SITE}/dez-layouts#s4`);
});
