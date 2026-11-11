// The NL→SQL special (owner, 2026-11-11) in the S6 direction "Camadas de Vidro", on the Hosting emulator with
// firebase.json: its own dark shell (no weekly theme, no scheme toggle), reading whole without JS, every platform card,
// 320 px without horizontal scroll, axe at 1440 and 390, and a still hero under reduced motion.
import { expect, test } from '@playwright/test';
import { axeBlocking, watchErrors } from './helpers.mjs';

const ROUTE = '/especiais/perguntar-ao-banco';
const PLATFORMS = ['Google Cloud', 'AWS', 'Microsoft Azure', 'Databricks', 'Snowflake', 'Claude Code', 'Codex', 'Gemini CLI'];

test.describe('especial NL→SQL (S6)', () => {
  test('has its own dark shell with the CSP and no errors, and is listed below the two guides', async ({ page }) => {
    const errors = watchErrors(page);
    const response = await page.goto(ROUTE);
    expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-special-layout', '');
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
    await expect(page.locator('[data-scheme-toggle]')).toHaveCount(0);
    await expect(page.locator('h1')).toContainText('Perguntamos ao banco em português');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.fonts.check('700 40px "Mona Sans"'))).toBe(true);
    expect(errors).toEqual([]);

    await page.goto('/edicoes');
    const hrefs = await page.locator('[data-specials] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const at = (slug) => hrefs.indexOf(`/especiais/${slug}`);
    expect(at('perguntar-ao-banco')).toBe(at('governanca-de-projetos') + 1);
    expect(at('governanca-de-projetos')).toBeGreaterThan(at('governanca-de-ia'));
  });

  test.describe('without JS', () => {
    test.use({ javaScriptEnabled: false });

    test('reads whole: the result, the benchmarks, the stack and all eight platforms', async ({ page }) => {
      await page.goto(ROUTE);
      await expect(page.locator('h2')).toHaveCount(8);
      await expect(page.getByRole('list', { name: 'Perguntas conhecidas: 2 certas e 13 erradas' }).locator('li')).toHaveCount(15);
      await expect(page.getByRole('list', { name: 'Perguntas novas: 3 certas e 2 erradas' }).locator('li')).toHaveCount(5);
      await expect(page.getByText('BEAVER, versão atual — agentes com GPT-5.2')).toBeVisible();
      await expect(page.locator('.layer')).toHaveCount(7);
      for (const name of PLATFORMS) await expect(page.getByRole('heading', { level: 4, name, exact: true })).toBeVisible();
      await expect(page.getByRole('row', { name: /Acerto/ })).toBeVisible();
      await expect(page.locator('[data-ai-note]')).toBeVisible();
    });
  });

  test('the platform chips jump to their cards', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('navigation', { name: 'Plataformas' }).getByRole('link', { name: 'Snowflake' }).click();
    await expect(page).toHaveURL(/#snowflake$/);
    await expect(page.locator('#snowflake')).toBeInViewport();
  });

  for (const width of [1440, 390]) {
    test(`axe finds no serious or critical issue (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      expect(await axeBlocking(page)).toEqual([]);
    });
  }

  test('fits 320 px without horizontal scroll, the table as cards and the plate labels under the art', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(ROUTE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await expect(page.locator('.cmp thead')).toBeHidden();
    await expect(page.locator('.art-legend')).toBeVisible();
  });

  test('the hero stays still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(ROUTE);
    const stack = page.locator('[data-stack]');
    await page.mouse.move(200, 200);
    await page.mouse.move(900, 600);
    expect(await stack.evaluate((el) => el.style.getPropertyValue('--px'))).toBe('');
  });
});
