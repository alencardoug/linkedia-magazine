// Reading modes (V2-06, D-081) on the single e2e build (example + v2 fixture content), served with firebase.json (CSP included): light/dark from the
// system until the reader picks, black only when picked; the stored pick painted from the first frame (no flash,
// checked on the first frame and on a real screenshot); the header button by keyboard and screen reader; invalid or
// blocked storage; other tabs; no JS; covers and art-directed specials untouched; axe and 320 px in the three modes.
// Replaces e2e/themes.spec.mjs and e2e/real-themes.spec.mjs (the retired weekly themes, 1C-01/1C-03).
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { LEGACY_THEME_KEY, MODE_KEY } from '../src/lib/mode.ts';
import { axeBlocking, layoutShift, pixel, presetMode, watchErrors } from './helpers.mjs';

const ARTICLE = '/materias/exemplo-de-materia-linkedia';
// The three looks (D-085): light = Broadsheet, dark = Singularidade, black = minimal-dark.
const BG = { light: 'rgb(245, 240, 230)', dark: 'rgb(10, 13, 38)', black: 'rgb(17, 18, 20)' };
const LABEL = { light: 'Claro', dark: 'Escuro', black: 'Preto' };
const NEXT = { light: 'escuro', dark: 'preto', black: 'claro' };
const toggle = (page) => page.getByRole('button', { name: /^Modo de leitura:/ });
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Records, before any page script, the mode attribute when <body> first exists and the colours of the first frame. */
const recordFirstFrame = (page) =>
  page.addInitScript(() => {
    // Init scripts may run before <html> exists: watch the document and read the root lazily.
    const seen = (window.__firstFrame = {});
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      seen.modeAtBody = document.documentElement.getAttribute('data-mode');
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
    requestAnimationFrame(() => {
      seen.mode = document.documentElement.getAttribute('data-mode');
      seen.bg = document.body ? getComputedStyle(document.body).backgroundColor : null;
    });
  });

test.describe('no flash on load', () => {
  // [system scheme, stored pick, mode on screen]
  const CASES = [
    ['light', null, 'light'],
    ['dark', null, 'dark'],
    ['dark', 'light', 'light'],
    ['light', 'dark', 'dark'],
    ['light', 'black', 'black'],
    ['dark', 'black', 'black'],
  ];
  for (const [system, pick, mode] of CASES) {
    test(`${system} system, ${pick ?? 'no'} pick: ${mode} from the first frame`, async ({ page }, testInfo) => {
      const errors = watchErrors(page);
      await page.emulateMedia({ colorScheme: system });
      if (pick) await presetMode(page, pick);
      await recordFirstFrame(page);
      await page.goto(ARTICLE);
      const first = await page.evaluate(() => window.__firstFrame);
      expect(first).toEqual({ modeAtBody: pick, mode: pick, bg: BG[mode] });
      expect(await background(page)).toBe(BG[mode]);
      // What is painted, read from a screenshot: the page margin and the header band.
      expect(await pixel(page, 2, 2)).toBe(BG[mode]);
      const shot = join(testInfo.project.outputDir, 'screenshots', 'modos', `${system}-${pick ?? 'sem-escolha'}.png`);
      await testInfo.attach(`${system} system, ${pick ?? 'no'} pick`, { body: await page.screenshot({ path: shot }), contentType: 'image/png' });
      expect(errors).toEqual([]);
    });
  }
});

test.describe('the mode button', () => {
  test('cycles by keyboard, announces the new mode, remembers it on every reading page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/revista');
    const button = toggle(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName('Modo de leitura: Escuro');
    await expect(button).toHaveAccessibleDescription('Muda para o modo preto.');
    await expect(page.locator('html')).not.toHaveAttribute('data-mode');
    // Reached with Tab after the skip link and the navigation.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const html = page.locator('html');
    const status = page.locator('[data-mode-status]');
    for (const [key, mode] of [['Enter', 'black'], ['Space', 'light'], ['Enter', 'dark']]) {
      await page.keyboard.press(key);
      await expect(html).toHaveAttribute('data-mode', mode);
      await expect(button).toHaveAccessibleName(`Modo de leitura: ${LABEL[mode]}`);
      await expect(button).toHaveAccessibleDescription(`Muda para o modo ${NEXT[mode]}.`);
      await expect(button).toHaveAttribute('data-current', mode);
      await expect(status).toHaveText(`Modo ${LABEL[mode].toLowerCase()} ativado.`);
      await expect(button).toBeFocused();
      expect(await background(page)).toBe(BG[mode]);
      expect(await page.evaluate((k) => localStorage.getItem(k), MODE_KEY)).toBe(mode);
    }
    await page.keyboard.press('Enter'); // black
    for (const path of ['/visual', ARTICLE, '/sobre']) {
      await page.goto(path);
      await expect(html).toHaveAttribute('data-mode', 'black');
      await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Preto');
    }
    expect(errors).toEqual([]);
  });

  test('follows the system without a pick, never turns black by itself, and holds a pick against the system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(ARTICLE);
    const html = page.locator('html');
    await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Claro');
    expect(await background(page)).toBe(BG.light);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Escuro');
    expect(await background(page)).toBe(BG.dark);
    await expect(html).not.toHaveAttribute('data-mode');
    await toggle(page).click(); // dark → black
    await expect(html).toHaveAttribute('data-mode', 'black');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Preto');
    expect(await background(page)).toBe(BG.black);
  });

  test('ignores invalid stored values and clears the retired theme key', async ({ page }) => {
    for (const bad of ['current', 'preto', 'auto', '', 'DARK']) {
      await page.addInitScript(([k, v, legacy]) => {
        localStorage.setItem(k, v);
        localStorage.setItem(legacy, 'current');
      }, [MODE_KEY, bad, LEGACY_THEME_KEY]);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/sobre');
      await expect(page.locator('html'), bad).not.toHaveAttribute('data-mode');
      await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Escuro');
      expect(await background(page)).toBe(BG.dark);
      expect(await page.evaluate((k) => localStorage.getItem(k), LEGACY_THEME_KEY)).toBeNull();
    }
  });

  test('a tampered attribute is not a pick', async ({ page }) => {
    await page.addInitScript(() =>
      new MutationObserver((_, o) => {
        if (!document.body) return;
        document.documentElement.setAttribute('data-mode', 'neon');
        o.disconnect();
      }).observe(document, { childList: true, subtree: true }),
    );
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/sobre');
    await expect(page.locator('html')).not.toHaveAttribute('data-mode');
    await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Claro');
  });

  test('works with storage blocked: the pick lasts for the page view', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const blocked = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', { get: blocked, configurable: true });
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/revista');
    await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Claro');
    await toggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await toggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'black');
    expect(await background(page)).toBe(BG.black);
    // Restored from the back/forward cache with storage unreadable: this page view's pick stays.
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'black');
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-mode');
    expect(errors).toEqual([]);
  });

  test('a page restored from the back/forward cache follows storage again', async ({ page }) => {
    const restore = () => page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.emulateMedia({ colorScheme: 'light' });
    await presetMode(page, 'black');
    await page.goto('/revista');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-mode', 'black');
    // Cleared elsewhere, then an invalid value: no pick, so the system mode again (never a stale black).
    for (const stored of [null, 'neon']) {
      await page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)), [MODE_KEY, stored]);
      await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'black'));
      await restore();
      await expect(html).not.toHaveAttribute('data-mode');
      await expect(toggle(page)).toHaveAccessibleName('Modo de leitura: Claro');
    }
    await page.evaluate((k) => localStorage.setItem(k, 'dark'), MODE_KEY);
    await restore();
    await expect(html).toHaveAttribute('data-mode', 'dark');
  });

  test('a pick in another tab reaches this one', async ({ context }) => {
    const [a, b] = [await context.newPage(), await context.newPage()];
    for (const p of [a, b]) {
      await p.emulateMedia({ colorScheme: 'light' });
      await p.goto('/revista');
    }
    await toggle(a).click();
    await expect(b.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(toggle(b)).toHaveAccessibleName('Modo de leitura: Escuro');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('reads in the system mode with the button hidden', async ({ page }) => {
    for (const system of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: system });
      await page.goto(ARTICLE);
      await expect(page.locator('html')).not.toHaveAttribute('data-mode');
      expect(await background(page)).toBe(BG[system]);
      await expect(page.locator('[data-mode-toggle]')).toBeHidden();
      await expect(toggle(page)).toHaveCount(0);
      await expect(page.locator('h1')).toBeVisible();
    }
  });
});

test.describe('pages with their own palette', () => {
  test.beforeEach(({ page }) => presetMode(page, 'black'));

  test('/visual is the gallery only; covers and art-directed specials ignore the pick', async ({ page }) => {
    await page.goto('/visual');
    await expect(page.getByRole('group', { name: 'Tema visual' })).toHaveCount(0);
    await expect(page.getByText('Tema de leitura')).toHaveCount(0);
    await expect(page.locator('[data-cover-item]').first()).toBeVisible();
    for (const path of ['/', '/visual/sismograma', '/especiais/governanca-de-ia', '/especiais/perguntar-ao-banco']) {
      await page.goto(path);
      await expect(page.locator('html'), path).not.toHaveAttribute('data-mode');
      await expect(page.locator('[data-mode-toggle]'), path).toHaveCount(0);
    }
  });
});

// The three looks: reduced motion draws no progress rule; forced colours keep the brand and the drop cap visible.
test.describe('motion and forced colours', () => {
  test('reduced motion: no animation in any look, before or after scrolling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animations = () => page.evaluate(() => document.getAnimations().length);
    for (const mode of ['light', 'dark', 'black']) {
      await presetMode(page, mode);
      await page.goto(ARTICLE);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      expect(await animations(), mode).toBe(0);
      await page.mouse.wheel(0, 3000);
      expect(await animations(), mode).toBe(0);
    }
  });

  test('forced colours: the brand and the drop cap stay painted', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    for (const mode of ['light', 'dark']) {
      await presetMode(page, mode);
      await page.goto('/revista');
      const brand = await page.locator('[data-brand] strong').evaluate((e) => getComputedStyle(e).color);
      expect(brand, mode).not.toBe('rgba(0, 0, 0, 0)');
    }
  });
});

// The layouts that differ, in the three modes: axe at 1100 px; at 320 px no horizontal scroll and no layout shift
// when the button appears; screenshots at both widths (attached; CI uploads them). Every other route is checked
// with axe and at 320 px by e2e/smoke.spec.mjs in the system default (light, Broadsheet).
const ROUTES = ['/revista', ARTICLE, '/edicoes', '/visual'];
const shotName = (route) => route.slice(1).replaceAll('/', '_');
for (const mode of ['light', 'dark', 'black']) {
  test.describe(`mode ${mode}`, () => {
    test.beforeEach(({ page }) => presetMode(page, mode));

    for (const route of ROUTES) {
      test(`${route}: axe, 320 px`, async ({ page }, testInfo) => {
        const errors = watchErrors(page);
        const shot = async (width) => {
          const path = join(testInfo.project.outputDir, 'screenshots', mode, `${shotName(route)}-${width}.png`);
          await testInfo.attach(`${mode} ${route} ${width}px`, { body: await page.screenshot({ path, fullPage: true }), contentType: 'image/png' });
        };
        await page.setViewportSize({ width: 1100, height: 900 });
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await expect(toggle(page)).toBeVisible();
        expect(await axeBlocking(page)).toEqual([]);
        await shot(1100);
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto(route);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        expect(await layoutShift(page)).toBeLessThan(0.1);
        expect(await axeBlocking(page)).toEqual([]);
        await shot(320);
        expect(errors).toEqual([]);
      });
    }
  });
}
