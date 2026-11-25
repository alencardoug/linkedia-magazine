// GovernaProj redirect switch (V2-02b) on the Hosting emulator: the old URLs answer 301 with the new page in
// `Location`, a browser keeps the fragment across the redirect, and an old page (the pre-switch snapshot HTML, served
// here as a fixture with the production headers) still loads every module and stylesheet from the kept
// `assets/<hash>/`. The new site is never contacted: its pages are stubbed in the browser.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers.mjs';
import { LEGACY_HASH, OLD_TO_NEW, ROUTE, SITE } from './fixtures/governanca-de-projetos-legado/urls.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURES = join(ROOT, 'e2e', 'fixtures', 'governanca-de-projetos-legado');
// The production headers of every page (firebase.json `source: "**"`), so the old page runs under the real CSP.
const HEADERS = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'))
    .hosting.headers.find((h) => h.source === '**')
    .headers.map((h) => [h.key, h.value]),
);
// A JavaScript MIME type for modules (production serves text/javascript, the emulator application/javascript).
const JS = /^(?:text|application)\/javascript\b/;
const MIME = { mjs: JS, js: JS, css: /^text\/css\b/ };

test('every old URL redirects (301) to its page on the new site; unknown paths stay 404', async ({ request }) => {
  for (const [from, to] of Object.entries(OLD_TO_NEW)) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(301);
    expect(res.headers().location, from).toBe(to);
  }
  expect((await request.get(`${ROUTE}/qualquer`, { maxRedirects: 0 })).status()).toBe(404);
});

test('a browser keeps the fragment across the redirect', async ({ page }) => {
  await page.route(`${SITE}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>GovernaProj</title><p>novo site</p>' }),
  );
  await page.goto(`${ROUTE}#estacao=p1`);
  expect(page.url()).toBe(`${SITE}/#estacao=p1`);
  await page.goto(`${ROUTE}/guia-completo#guia-g1`);
  expect(page.url()).toBe(`${SITE}/guia-completo#guia-g1`);
});

for (const [name, path] of [
  ['mapa.html', '/__legado/governanca-de-projetos'],
  ['guia-completo.html', '/__legado/governanca-de-projetos/guia-completo'],
]) {
  test(`an old page opened before the switch (${name}) loads all its assets with 200 and the right MIME`, async ({ page }) => {
    const body = readFileSync(join(FIXTURES, name), 'utf8');
    await page.route(`**${path}`, (route) =>
      route.fulfill({ status: 200, headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' }, body }),
    );
    await page.route(`${SITE}/**`, (route) => route.abort());
    const errors = watchErrors(page);
    const assets = [];
    page.on('response', (res) => {
      if (res.url().includes(`${ROUTE}/assets/`)) assets.push(res);
    });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(assets.length).toBeGreaterThan(name === 'mapa.html' ? 3 : 0);
    for (const res of assets) {
      expect(res.url(), res.url()).toContain(`${ROUTE}/assets/${LEGACY_HASH}/`);
      expect(res.status(), res.url()).toBe(200);
      const ext = res.url().split('.').pop();
      expect(res.headers()['content-type'], res.url()).toMatch(MIME[ext]);
    }
    expect(errors).toEqual([]);
    if (name === 'mapa.html') await expect(page.locator('main')).not.toBeEmpty();
  });
}
