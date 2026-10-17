// Real themes (1C-03) on the production build (`npm run e2e:themes`: real content, themes/manifest.json): every
// slot of the manifest on one page of each kind, at 1100 and 320 px — axe, no horizontal scroll, no layout shift,
// switcher visible, no errors, and a full-page screenshot in test-results/screenshots/<theme>/ (attached to the
// report; CI uploads them). Then reduced motion and a device without WebGL. Generic over the manifest, so it keeps
// working after each rollover.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { readManifest, slots } from '../scripts/themes.mjs';
import { axeBlocking, layoutShift, preset, watchErrors, withoutWebgl } from './helpers.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const pages = (dir) =>
  readdirSync(join(ROOT, 'dist', dir))
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => `/${dir}/${f.slice(0, -'.html'.length)}`);
const NOT_FOUND = '/pagina-que-nao-existe';
const ARTICLES = pages('materias').slice(0, 3);
const ROUTES = ['/revista', '/edicoes', pages('edicoes').at(-1), pages('categorias')[0], ...ARTICLES, '/sobre', NOT_FOUND];
const WIDTHS = [1100, 320];
const SLOTS = Object.entries(slots(readManifest())).filter(([, theme]) => theme !== null);
const ENHANCE = '/enhance.';
const shotName = (route) => route.slice(1).replaceAll('/', '_');
const ignore404 = (route) => (route === NOT_FOUND ? /status of 404/ : undefined);

test('the production build has pages of every kind and a lab theme in the current slot', () => {
  expect(ROUTES.every(Boolean)).toBe(true);
  expect(ARTICLES.length).toBeGreaterThan(0);
  expect(slots(readManifest()).current).not.toBeNull();
});

for (const [slot, theme] of SLOTS) {
  test.describe(`slot ${slot} (${theme.id})`, () => {
    test.beforeEach(({ page }) => preset(page, slot));

    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        test(`${route} at ${width} px`, async ({ page }, testInfo) => {
          const errors = watchErrors(page, ignore404(route));
          await page.setViewportSize({ width, height: width < 600 ? 640 : 900 });
          await page.goto(route);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
          await expect(page.getByRole('group', { name: 'Tema visual' })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          expect(await layoutShift(page)).toBeLessThan(0.1);
          expect(await axeBlocking(page)).toEqual([]);
          const path = join(testInfo.project.outputDir, 'screenshots', theme.id, `${shotName(route)}-${width}.png`);
          await testInfo.attach(`${theme.id} ${route} ${width}px`, {
            body: await page.screenshot({ path, fullPage: true }),
            contentType: 'image/png',
          });
          expect(errors).toEqual([]);
        });
      }
    }

    test.describe('reduced motion', () => {
      test.use({ reducedMotion: 'reduce' });

      test('has no animation, before or after scrolling, and fetches no enhancement', async ({ page }) => {
        const requests = [];
        page.on('request', (r) => requests.push(r.url()));
        // Any animation counts, not only running ones: a scroll-driven one reads as finished at the page end.
        const animations = () =>
          page.evaluate(() => document.getAnimations().map((a) => a.animationName ?? a.transitionProperty ?? String(a)));
        await page.goto(ARTICLES[0]);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
        expect(await animations()).toEqual([]);
        await page.mouse.wheel(0, 5000);
        await page.waitForLoadState('networkidle');
        expect(await animations()).toEqual([]);
        expect(requests.filter((u) => u.includes(ENHANCE))).toEqual([]);
        await expect(page.locator('html')).not.toHaveAttribute('data-theme-enhanced');
      });
    });

    test('without WebGL: stays readable in this theme, with no fallback and no WebGL module', async ({ page }) => {
      const errors = watchErrors(page);
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      await withoutWebgl(page);
      await page.goto(ARTICLES[0]);
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme.id);
      await page.waitForLoadState('networkidle');
      await expect(html).not.toHaveAttribute('data-theme-fallback');
      if (theme.requires?.includes('webgl')) {
        await expect(html).not.toHaveAttribute('data-theme-enhanced');
        expect(requests.filter((u) => u.includes(ENHANCE))).toEqual([]);
      }
      await expect(page.locator('h1')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

// The cover pre-page (3-01) of the production build as every device first sees it (headless Chromium has no WebGL,
// so this is the HTML cover the art is painted from): 320 and 1100 px, axe, and a screenshot next to the themes'.
for (const width of WIDTHS) {
  test(`cover / at ${width} px`, async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 640 : 900 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-cover', /./);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await axeBlocking(page)).toEqual([]);
    const path = join(testInfo.project.outputDir, 'screenshots', 'cover', `cover-${width}.png`);
    await testInfo.attach(`cover ${width}px`, { body: await page.screenshot({ path }), contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}
