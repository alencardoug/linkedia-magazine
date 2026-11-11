// The AI governance guide in the S4 direction (3-22, D-076/D-077) on the Hosting emulator with firebase.json: its own
// shell (no weekly theme), the page-only light/dark choice (follows the system until picked, remembered, applied
// before the first paint), reading whole without JS, the four diagram controls (failure counterfactual, YAML
// inspector, architecture paths, two rulers), 320 px, axe in both schemes, reduced motion and forced colours.
import { expect, test } from '@playwright/test';
import { axeBlocking, layoutShift, watchErrors } from './helpers.mjs';

const ROUTE = '/especiais/governanca-de-ia';
const KEY = 'linkedia.guia-ia.esquema';
const toggle = (page) => page.getByRole('button', { name: 'Modo escuro' });
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('guia de governança de IA (S4)', () => {
  test('has its own shell, not the weekly theme, with the CSP and no errors', async ({ page }) => {
    const errors = watchErrors(page);
    const response = await page.goto(ROUTE);
    expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-special-layout', '');
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
    await expect(page.locator('h1')).toHaveText('Guia Governança de IA: como implementar em ambientes corporativos');
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Edições' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.fonts.check('800 40px "Bricolage Grotesque"'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('follows the system scheme until the reader picks one, then remembers it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(ROUTE);
    const light = await background(page);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await toggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'escuro');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    const dark = await background(page);
    expect(dark).not.toBe(light);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('escuro');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'escuro');
    expect(await background(page)).toBe(dark);
    await toggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'claro');
    expect(await background(page)).toBe(light);
  });

  test('a dark system opens dark, with the toggle pressed', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(ROUTE);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).not.toHaveAttribute('data-scheme', /.+/);
  });

  test.describe('without JS', () => {
    test.use({ javaScriptEnabled: false });

    test('reads whole: every section, table and diagram text, no dead controls', async ({ page }) => {
      await page.goto(ROUTE);
      await expect(toggle(page)).toBeHidden();
      for (const name of ['Simular falha no teste', 'Caminho do RAG', 'Política']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
      }
      await expect(page.locator('h2')).toHaveCount(14);
      const matrix = page.getByRole('region', { name: 'Matriz de homologação do AI-023' });
      await expect(matrix.getByRole('rowheader', { name: 'Troca de modelo' })).toBeVisible();
      for (const text of [
        'Se o teste falhar, a implementação é corrigida e reavaliada antes da decisão.',
        'Decisão: critérios atendidos e risco residual aceito?',
        'Mudança relevante ou incidente: o sistema volta ao G1.',
        'Observabilidade e governança técnica',
        'Engenharia madura não substitui governança institucional',
      ]) {
        await expect(page.getByText(text).first()).toBeVisible();
      }
      await expect(page.locator('pre code').filter({ hasText: 'source_policy: POL-PRIV-01' })).toBeVisible();
      await expect(page.locator('[data-ai-note]')).toBeVisible();
    });
  });

  test('§1 links each question to where the guide develops it, and the codes link across Parts I and II', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('link', { name: '9.5 Matriz de homologação' }).click();
    await expect(page).toHaveURL(/#homologacao$/);
    await page.locator('#gov-04').scrollIntoViewIfNeeded();
    await page.locator('a.tag[href="#tec-03"]').first().click();
    await expect(page).toHaveURL(/#tec-03$/);
    await expect(page.locator('#tec-03').getByRole('link', { name: 'GOV-08' })).toBeVisible();
  });

  test('§6 failure counterfactual, §7.1 YAML inspector and §9.2 paths are pressable buttons with a reset', async ({ page }) => {
    await page.goto(ROUTE);
    const chain = page.locator('[data-chain]');
    const fail = page.getByRole('button', { name: 'Simular falha no teste' });
    await fail.click();
    await expect(fail).toHaveAttribute('aria-pressed', 'true');
    await expect(chain).toHaveAttribute('data-fail', '');
    await fail.press('Enter');
    await expect(fail).toHaveAttribute('aria-pressed', 'false');
    await expect(chain).not.toHaveAttribute('data-fail', /.*/);

    const yaml = page.locator('[data-yaml]');
    const tools = page.getByRole('group', { name: /Destacar no arquivo/ });
    await tools.getByRole('button', { name: 'Teste' }).click();
    await expect(yaml).toHaveAttribute('data-show', 'teste');
    await tools.getByRole('button', { name: 'Evidência' }).click();
    await expect(yaml).toHaveAttribute('data-show', 'evidencia');
    await expect(tools.getByRole('button', { name: 'Teste' })).toHaveAttribute('aria-pressed', 'false');
    await tools.getByRole('button', { name: 'Evidência' }).click();
    await expect(yaml).not.toHaveAttribute('data-show', /.*/);
    await expect(page.locator('.ln[data-kind="teste"]')).toHaveCount(2);

    const arch = page.locator('[data-arch]');
    await expect(arch).toHaveAttribute('data-wired', '');
    expect(await arch.locator('.arch-wires path').count()).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Caminho do agente' }).click();
    await expect(arch).toHaveAttribute('data-route', 'agente');
    await page.getByRole('button', { name: 'Caminho do RAG' }).click();
    await expect(arch).toHaveAttribute('data-route', 'rag');
    await expect(page.getByRole('button', { name: 'Caminho do agente' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('§12.2 the two rulers start empty and place a mark only when both have a level', async ({ page }) => {
    await page.goto(ROUTE);
    const mark = page.locator('.ruler-mark');
    expect(await page.locator('.rulers input:checked').count()).toBe(0);
    await expect(mark).toBeHidden();
    await page.getByRole('group', { name: 'Corporativa' }).getByRole('radio', { name: /3 · Definida/ }).check();
    await expect(mark).toBeHidden();
    await page.getByRole('group', { name: 'Técnica' }).getByRole('radio', { name: /2 · Básica/ }).check();
    await expect(mark).toBeVisible();
  });

  for (const scheme of ['claro', 'escuro']) {
    for (const width of [1440, 390]) {
      test(`axe finds no serious or critical issue (${scheme}, ${width} px)`, async ({ page }) => {
        await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, scheme]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(ROUTE);
        await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
        expect(await axeBlocking(page)).toEqual([]);
      });
    }
  }

  test.describe('320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test('has no horizontal scroll and no layout shift', async ({ page }) => {
      await page.goto(ROUTE);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      expect(await layoutShift(page)).toBeLessThan(0.1);
      await expect(toggle(page)).toBeVisible();
    });
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('runs no animation, before or after the controls', async ({ page }) => {
      await page.goto(ROUTE);
      await page.getByRole('button', { name: 'Simular falha no teste' }).click();
      await page.mouse.wheel(0, 8000);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });

  test('forced colours keep the text, the controls and their pressed state', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(ROUTE);
    await expect(page.locator('.threads')).toBeHidden();
    const fail = page.getByRole('button', { name: 'Simular falha no teste' });
    await fail.click();
    await expect(fail).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
});
