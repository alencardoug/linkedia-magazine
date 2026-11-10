// Standalone special "Governança de Projetos" (owner, 2026-11-10) on the Hosting emulator with firebase.json: the
// slashless canonical route and its reading page, one-hop redirects, MIME types of every file the pages load (no
// HTML in place of a script, style or JSON), CSP, deep link + reload, list view, 320 px, shared theme choice,
// reading without JS, and the link from /edicoes.
import { expect, test } from '@playwright/test';
import { axeBlocking, watchErrors } from './helpers.mjs';

const ROUTE = '/especiais/governanca-de-projetos';
const READING = `${ROUTE}/guia-completo`;
const ASSETS = new RegExp(`^${ROUTE}/assets/[0-9a-f]{16}/`);
const MIME = { '.css': /^text\/css/, '.js': /^(?:text|application)\/javascript/, '.mjs': /^(?:text|application)\/javascript/ };

/** Every same-origin file the page fetched (besides the document), as [path, status, content-type]. */
function watchFiles(page, origin) {
  const files = [];
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (url.origin === origin && r.request().resourceType() !== 'document') {
      files.push([url.pathname, r.status(), r.headers()['content-type'] ?? '']);
    }
  });
  return files;
}

test.describe('governança de projetos', () => {
  for (const [path, selector] of [
    [ROUTE, '.map-card'],
    [READING, '#estacoes'],
  ]) {
    test(`${path} is served directly with its own files, the CSP and no errors`, async ({ page, baseURL }) => {
      const errors = watchErrors(page);
      const files = watchFiles(page, new URL(baseURL).origin);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(new URL(response.url()).pathname).toBe(path); // no redirect
      expect(response.headers()['content-type']).toMatch(/^text\/html/);
      expect(response.headers()['content-security-policy']).toContain("default-src 'none'");
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      expect(files.length).toBeGreaterThanOrEqual(path === ROUTE ? 10 : 3); // the module graph on the map page
      for (const [file, status, type] of files) {
        expect(file).toMatch(ASSETS);
        expect(status, file).toBe(200);
        expect(type, file).toMatch(MIME[file.slice(file.lastIndexOf('.'))]);
      }
      expect(errors).toEqual([]);
    });
  }

  test('the editorial JSON is served as JSON', async ({ request }) => {
    const response = await request.get(`${ROUTE}/conteudo.json`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^application\/json/);
    expect((await response.json()).stations.length).toBeGreaterThan(30);
  });

  test('.html and trailing-slash URLs redirect once to the clean URL', async ({ page }) => {
    for (const [path, clean] of [
      [`${ROUTE}/`, ROUTE],
      [`${ROUTE}.html`, ROUTE],
      [`${READING}.html`, READING],
      [`${READING}/`, READING],
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe(clean);
      expect(response?.request().redirectedFrom()?.redirectedFrom(), path).toBeNull();
    }
  });

  test('a station deep link survives a reload; the reading page and JSON links use the served URLs', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${ROUTE}#estacao=p1`);
    await expect(page.locator('#detail-dialog')).toHaveAttribute('open', '');
    await page.reload();
    await expect(page.locator('#detail-dialog')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-dialog')).not.toHaveAttribute('open', '');
    await page.goto(`${ROUTE}#biblioteca`);
    await expect(page.locator('a[href$="/conteudo.json"]')).toHaveAttribute('href', `${ROUTE}/conteudo.json`);
    await page.locator(`#view-content a[href="${READING}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${READING}$`));
    await page.getByRole('link', { name: '← Abrir mapa interativo' }).click();
    await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
    await expect(page.locator('.map-card')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true });

    test('"Ver em lista" opens the station list; no view scrolls sideways at 320 px', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(ROUTE);
      await page.getByRole('button', { name: /Ver em lista/ }).click();
      await expect(page).toHaveURL(/#checklist$/);
      await expect(page.locator('#station-list')).toBeVisible();
      for (const [view, selector] of [
        ['mapa', '.map-card'],
        ['checklist', '#station-list'],
        ['biblioteca', '#library-results'],
        ['metodo', '.method-intro'],
      ]) {
        await page.goto(`${ROUTE}#${view}`);
        await expect(page.locator(selector)).toBeVisible();
        const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        expect(scroll, view).toBeLessThanOrEqual(client);
      }
      await page.goto(READING);
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(scroll, 'reading').toBeLessThanOrEqual(client);
      expect(errors).toEqual([]);
    });
  });

  test('the theme choice carries from the map to the reading page and back', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(ROUTE);
    await page.locator('#theme-preference').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto(READING);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#theme-preference')).toHaveValue('dark');
    await page.locator('#theme-preference').selectOption('system');
    await page.goto(ROUTE);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('has no serious or critical axe violation on the map and the reading page', async ({ page }) => {
    test.setTimeout(120_000); // axe over the full reading page (~140 KB of HTML) takes ~15 s alone, more under load
    for (const [path, selector] of [
      [ROUTE, '.map-card'],
      [READING, '#estacoes'],
    ]) {
      await page.goto(path);
      await expect(page.locator(selector)).toBeVisible();
      expect(await axeBlocking(page), path).toEqual([]);
    }
  });

  test('is listed on /edicoes right below the AI guide and opens as an ordinary link', async ({ page }) => {
    await page.goto('/edicoes');
    const links = page.locator('[data-specials] li > a');
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.indexOf(ROUTE)).toBe(hrefs.indexOf('/especiais/governanca-de-ia') + 1);
    await page.getByRole('link', { name: /^Guia Governança de Projetos/ }).click();
    await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
    await expect(page.locator('h1')).toContainText('Governança');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the map page offers the full reading version, which reads completely', async ({ page }) => {
    await page.goto(ROUTE);
    const fallback = page.locator('#module-fallback');
    await expect(fallback).toBeVisible();
    await fallback.getByRole('link', { name: 'Abrir versão de leitura e impressão' }).click();
    await expect(page).toHaveURL(new RegExp(`${READING}$`));
    expect(await page.locator('#estacoes article').count()).toBeGreaterThan(30);
  });
});
