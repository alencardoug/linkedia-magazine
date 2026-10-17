// Theme switcher (1C-01) on the fixture themes: baseline / previous (lab-2099-w01, light, CSS only) / current
// (lab-2099-w02, default, enhancement that needs motion and WebGL). Served by the Hosting emulator with the real CSP.
// Headless Chromium has no WebGL, so every page gets a stand-in context unless a test opts out (`webgl: false`).
import { expect, test as base } from '@playwright/test';
import { axeBlocking, KEY, preset, watchErrors, withoutWebgl, withWebgl } from './helpers.mjs';

const test = base.extend({
  webgl: [true, { option: true }],
  page: async ({ page, webgl }, use) => {
    await (webgl ? withWebgl(page) : withoutWebgl(page));
    await use(page);
  },
});

const ARTICLE = '/materias/exemplo-de-materia-linkedia';
const ENHANCE = '**/_astro/enhance.*.js';
const THEMES = { baseline: 'minimal-dark', previous: 'lab-2099-w01', current: 'lab-2099-w02' };
const LIGHT_BG = 'rgb(251, 250, 247)';

const theme = (page) => page.locator('html');
const radio = (page, name) => page.getByRole('radio', { name });
const status = (page) => page.locator('[data-theme-status]');
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const content = (page) => page.locator('main').innerHTML();

test('opens in the current slot with its enhancement and an operable switcher', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(ARTICLE);
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.current);
  await expect(theme(page)).toHaveAttribute('data-theme-enhanced', THEMES.current);
  await expect(page.locator('[data-theme-decor]')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Tema visual' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(radio(page, 'Atual: Fixture Motion')).toBeChecked();
  await expect(radio(page, 'Anterior: Fixture Light')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('switches by keyboard, announces, persists and cleans up the enhancement', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(ARTICLE);
  await expect(theme(page)).toHaveAttribute('data-theme-enhanced', THEMES.current);
  await page.locator('footer a[rel="author"]').focus();
  await page.keyboard.press('Tab'); // into the radio group, on the checked radio
  await expect(radio(page, 'Atual: Fixture Motion')).toBeFocused();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline).not.toBe('none');

  await page.keyboard.press('ArrowLeft');
  await expect(radio(page, 'Anterior: Fixture Light')).toBeChecked();
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.previous);
  await expect(status(page)).toHaveText('Tema aplicado: Fixture Light.');
  await expect(page.locator('[data-theme-decor]')).toHaveCount(0);
  await expect(theme(page)).not.toHaveAttribute('data-theme-enhanced');
  expect(await background(page)).toBe(LIGHT_BG);
  expect(await stored(page)).toBe('previous');

  await page.keyboard.press('ArrowLeft');
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.baseline);
  await expect(status(page)).toHaveText('Tema aplicado: Minimal Dark.');

  await page.goto('/edicoes');
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.baseline);
  await expect(radio(page, 'Base: Minimal Dark')).toBeChecked();
  await expect(status(page)).toHaveText(''); // nothing announced on load
  expect(errors).toEqual([]);
});

test('never changes the article content across switches and a fallback', async ({ page }) => {
  await page.goto(ARTICLE);
  await expect(theme(page)).toHaveAttribute('data-theme-enhanced', THEMES.current);
  const before = await content(page);
  for (const name of ['Anterior: Fixture Light', 'Base: Minimal Dark', 'Atual: Fixture Motion']) {
    await radio(page, name).check();
    await expect(radio(page, name)).toBeChecked();
    expect(await content(page), name).toBe(before);
  }
  await expect(theme(page)).toHaveAttribute('data-theme-enhanced', THEMES.current);
  await page.evaluate(() => setTimeout(() => { throw new Error('late'); }));
  await expect(theme(page)).toHaveAttribute('data-theme-fallback', THEMES.current);
  expect(await content(page)).toBe(before);
});

test('the inline script alone applies the stored slot before the body is parsed', async ({ page }) => {
  await page.goto(ARTICLE);
  await radio(page, 'Anterior: Fixture Light').check();
  await page.route('**/_astro/ThemeSwitcher*.js', (route) => route.abort());
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      window.__themeAtBody = document.documentElement.getAttribute('data-theme');
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  expect(await page.evaluate(() => window.__themeAtBody)).toBe(THEMES.previous);
  expect(await background(page)).toBe(LIGHT_BG);
  await expect(page.locator('[data-theme-switcher]')).toBeHidden(); // its script never ran
});

test('ignores a stored value that is not a slot', async ({ page }) => {
  await preset(page, THEMES.previous);
  await page.goto(ARTICLE);
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.current);
  await expect(radio(page, 'Atual: Fixture Motion')).toBeChecked();
});

test('works when storage is blocked', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    }),
  );
  await page.goto(ARTICLE);
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.current);
  await radio(page, 'Base: Minimal Dark').check();
  await expect(theme(page)).toHaveAttribute('data-theme', THEMES.baseline);
  await expect(status(page)).toHaveText('Tema aplicado: Minimal Dark.');
  expect(errors).toEqual([]);
});

test.describe('fallback to the baseline', () => {
  test('when the enhancement module cannot load', async ({ page }) => {
    await page.route(ENHANCE, (route) => route.abort());
    await page.goto(ARTICLE);
    await expect(theme(page)).toHaveAttribute('data-theme', THEMES.baseline);
    await expect(theme(page)).toHaveAttribute('data-theme-fallback', THEMES.current);
    await expect(radio(page, 'Base: Minimal Dark')).toBeChecked();
    await expect(status(page)).toHaveText('O tema Fixture Motion falhou; voltamos ao Minimal Dark.');
    await expect(page.locator('h1')).toHaveText('Exemplo ilustrativo de matéria');
    expect(await stored(page)).toBeNull(); // the reader's choice is not overwritten
  });

  test('when the enhancement throws later, in a timer', async ({ page }) => {
    await page.route(ENHANCE, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export default () => {
          const bar = document.createElement('div');
          bar.setAttribute('data-theme-decor', '');
          document.body.append(bar);
          setTimeout(() => { throw new Error('late'); }, 100);
          return () => bar.remove();
        };`,
      }),
    );
    await page.goto(ARTICLE);
    await expect(theme(page)).toHaveAttribute('data-theme-fallback', THEMES.current);
    await expect(theme(page)).toHaveAttribute('data-theme', THEMES.baseline);
    await expect(page.locator('[data-theme-decor]')).toHaveCount(0); // its cleanup ran
    await expect(radio(page, 'Base: Minimal Dark')).toBeChecked();
    await expect(status(page)).toHaveText('O tema Fixture Motion falhou; voltamos ao Minimal Dark.');
  });

  test('when the enhancement throws', async ({ page }) => {
    const errors = watchErrors(page);
    await page.route(ENHANCE, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: 'export default () => { throw new Error("boom"); };' }),
    );
    await page.goto(ARTICLE);
    await expect(theme(page)).toHaveAttribute('data-theme', THEMES.baseline);
    await expect(theme(page)).toHaveAttribute('data-theme-fallback', THEMES.current);
    await expect(page.locator('[data-theme-decor]')).toHaveCount(0);
    expect(errors).toEqual([]); // caught: no uncaught error, only a console warning
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps the current theme CSS-only and never fetches its enhancement', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(ARTICLE);
    await expect(theme(page)).toHaveAttribute('data-theme', THEMES.current);
    await expect(page.getByRole('group', { name: 'Tema visual' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-theme-decor]')).toHaveCount(0);
    expect(requests.filter((u) => u.includes('/enhance.'))).toEqual([]);
  });
});

test.describe('without WebGL', () => {
  test.use({ webgl: false });

  test('keeps the current theme CSS-only, with no fallback, and never fetches its enhancement', async ({ page }) => {
    const errors = watchErrors(page);
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(ARTICLE);
    await expect(theme(page)).toHaveAttribute('data-theme', THEMES.current);
    await expect(radio(page, 'Atual: Fixture Motion')).toBeChecked();
    await page.waitForLoadState('networkidle');
    await expect(theme(page)).not.toHaveAttribute('data-theme-enhanced');
    await expect(theme(page)).not.toHaveAttribute('data-theme-fallback');
    await expect(page.locator('[data-theme-decor]')).toHaveCount(0);
    expect(requests.filter((u) => u.includes('/enhance.'))).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('reads in the build-time default theme with the switcher hidden', async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(theme(page)).toHaveAttribute('data-theme', THEMES.current);
    await expect(page.locator('[data-theme-switcher]')).toBeHidden();
    await expect(page.locator('#fonte-s1')).toBeVisible();
  });
});

for (const [slot, id] of Object.entries(THEMES)) {
  test.describe(`slot ${slot} (${id})`, () => {
    test.beforeEach(({ page }) => preset(page, slot));

    for (const path of ['/revista', ARTICLE]) {
      test(`${path}: no serious axe violation, no horizontal scroll at 320 px, switcher visible`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto(path);
        await expect(theme(page)).toHaveAttribute('data-theme', id);
        await expect(page.getByRole('group', { name: 'Tema visual' })).toBeVisible();
        await expect(page.getByRole('radio', { checked: true })).toHaveAttribute('value', slot);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        expect(await axeBlocking(page)).toEqual([]);
      });
    }
  });
}
