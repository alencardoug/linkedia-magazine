// Smoke suite over the example content (1B-04): routes, copy button, reading without JS, 320 px, axe. The
// build uses the fixture themes (tests/fixtures/themes), so pages open in the current lab slot; themes.spec.mjs
// covers the other slots.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ARTICLE = '/materias/exemplo-de-materia-linkedia';
const ROUTES = [
  '/',
  '/edicoes',
  '/edicoes/2026-10-14',
  ARTICLE,
  '/categorias/engenharia-de-ia',
  '/categorias/lideranca-de-ia',
  '/categorias/conhecimento-de-ia',
  '/sobre',
];
const PROMPT = 'Explique como avaliar criticamente uma notícia sobre inteligência artificial, com fontes e exemplos.';

// Fails the test on any CSP violation or uncaught page error.
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.describe('routes', () => {
  for (const path of ROUTES) {
    test(`${path} renders with the strict CSP and no errors`, async ({ page }) => {
      const errors = watchErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(response?.url()).toMatch(new RegExp(`${path === '/' ? '/' : path}$`)); // no redirect
      expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('footer a[rel="author"]')).toHaveText('Douglas Alencar');
      // The theme stylesheet is applied (it is a same-origin file the CSP must allow).
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(errors).toEqual([]);
    });
  }

  test('unknown paths get the pt-BR 404 page', async ({ page }) => {
    const response = await page.goto('/materias/nao-existe');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Página não encontrada');
  });

  test('.html and trailing-slash URLs redirect once to the clean URL', async ({ page }) => {
    for (const path of [`${ARTICLE}.html`, `${ARTICLE}/`]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(ARTICLE);
      expect(response?.request().redirectedFrom()?.redirectedFrom()).toBeNull();
    }
  });
});

test.describe('copy button', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copies the prompt and announces it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(ARTICLE);
    const button = page.getByRole('button', { name: 'Copiar: Saber mais' });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('[data-copy-status]')).toHaveText('Prompt copiado.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PROMPT);
    expect(errors).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the whole article reads and the prompt stays selectable', async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(page.locator('h1')).toHaveText('Exemplo ilustrativo de matéria');
    await expect(page.locator('#fonte-s1')).toBeVisible();
    await expect(page.getByRole('button', { name: /Copiar/ })).toBeHidden();
    await page.locator('summary', { hasText: 'Saber mais' }).click(); // <details> needs no JS
    await expect(page.locator('[data-prompt-text]')).toHaveText(PROMPT);
  });
});

test.describe('320 px viewport', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const path of [...ROUTES, '/nao-existe']) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(320);
    });
  }
});

test.describe('axe', () => {
  for (const path of [...ROUTES, '/nao-existe']) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(blocking).toEqual([]);
    });
  }
});
