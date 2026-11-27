// Cover pre-pages (3-01, docs/COVERS.md) on the Hosting emulator: `/` (the current cover) and every archived cover at
// `/visual/<slug>`. Headless Chromium has no WebGL here, so for the WebGL covers these specs exercise the HTML cover
// that every device gets first (and keeps without WebGL2); a Canvas 2D cover (CANVAS_2D) goes live here, so the same
// specs run with its art on. On every cover page: entry by click, tap or key from anywhere, the skip link, the
// fine-print links, drag versus tap, Back, the archive, a context that cannot draw (WebGL broken or software; no 2D
// context), 320 px, the viewports where the art may start, and axe — plus each cover's own checks (Singularidade's
// `#pintura` bitmap against the HTML it is painted from; Duas sombras' museum label; Sismograma's living sheet). The
// WebGL art itself is accepted on a real GPU (docs/COVERS.md, "Acceptance").
import { expect, test } from '@playwright/test';
import { COVERS, CURRENT_COVER } from '../src/covers/registry.ts';
import { axeBlocking, watchErrors, withWebgl } from './helpers.mjs';

const COVER = '/';
const ENTERED = /\/revista$/;
/** Every cover page and the cover it must show. */
const PAGES = [
  [COVER, CURRENT_COVER],
  ...COVERS.map((c) => [`/visual/${c.slug}`, c.slug]),
];
const HINT_HTML = 'Clique ou toque em qualquer lugar para entrar.';
/** Covers drawn with Canvas 2D: their art runs in headless Chromium, so their pages go live in these specs. */
const CANVAS_2D = new Set(['sismograma', 'transe']);

test.describe('cover', () => {
  for (const [path, slug] of PAGES) {
    test(`${path} renders ${slug} with the strict CSP, an h1, its fine print and no errors`, async ({ page }) => {
      const errors = watchErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
      await expect(page.locator('html')).toHaveAttribute('data-cover', slug);
      await expect(page.locator(`[data-cover-art="${slug}"]`)).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText('LinkedIA');
      await expect(page.locator('a[rel="author"]')).toHaveCount(0); // the editor is named on /sobre only
      await expect(page.getByText('Textos gerados com IA')).toHaveCount(0); // the AI note is on /revista only
      await expect(page.getByRole('link', { name: 'Outras capas' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Entrar na revista/ })).toBeVisible();
      if (CANVAS_2D.has(slug)) await expect(page.locator('html')).toHaveAttribute('data-art', 'live');
      else await expect(page.locator('html')).not.toHaveAttribute('data-art', /./); // no WebGL: the HTML cover stays
      expect(errors).toEqual([]);
    });
  }

  for (const [name, x, y] of [
    ['the middle', 0.5, 0.45],
    ['a corner', 0.03, 0.03],
    ['the label', 0.15, 0.6],
    ['empty space', 0.92, 0.3],
  ]) {
    test(`a click on ${name} enters the magazine`, async ({ page }) => {
      await page.goto(COVER);
      const { width, height } = page.viewportSize() ?? { width: 1280, height: 720 };
      await page.mouse.click(width * x, height * y);
      await expect(page).toHaveURL(ENTERED);
      await expect(page.locator('[data-edition]')).toBeVisible();
    });
  }

  test('the fine-print links go where they say', async ({ page }) => {
    await page.goto(COVER);
    await page.getByRole('link', { name: 'Outras capas' }).click();
    await expect(page).toHaveURL(/\/visual$/);
  });

  for (const key of ['Enter', 'Space', 'Escape']) {
    test(`${key} on the page enters the magazine`, async ({ page }) => {
      await page.goto(COVER);
      await page.keyboard.press(key);
      await expect(page).toHaveURL(ENTERED);
    });
  }

  test('letter keys do nothing, Tab shows the skip link first and it enters', async ({ page }) => {
    await page.goto(COVER);
    await page.keyboard.press('a');
    await page.keyboard.press('h');
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular a capa e ir para a revista' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(ENTERED);
  });

  test('Enter on a focused fine-print link follows that link', async ({ page }) => {
    await page.goto(COVER);
    await page.getByRole('link', { name: 'Outras capas' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/visual$/);
  });

  test('a drag does not enter; the next tap does', async ({ page }) => {
    await page.goto(COVER);
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(520, 340, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/$/);
    await page.mouse.click(400, 300);
    await expect(page).toHaveURL(ENTERED);
  });

  test('Back from the magazine shows the cover again and stays there', async ({ page }) => {
    await page.goto(COVER);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(ENTERED);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('h1')).toHaveText('LinkedIA');
  });

  for (const [path, slug] of PAGES) {
    if (CANVAS_2D.has(slug)) {
      test(`${path}: without a 2D context the HTML cover stays, with no page error`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.addInitScript(() => {
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
            return type === '2d' ? null : getContext.call(this, type, ...rest);
          };
        });
        await page.goto(path);
        await page.waitForTimeout(600);
        await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
        await expect(page.locator('[data-hint]')).toHaveText(HINT_HTML);
        await page.mouse.click(300, 200);
        await expect(page).toHaveURL(ENTERED);
        expect(errors).toEqual([]);
      });
      continue;
    }

    test(`${path}: a WebGL context that cannot draw leaves the HTML cover, with no page error`, async ({ page }) => {
      const errors = watchErrors(page);
      await withWebgl(page);
      await page.goto(path);
      await page.waitForTimeout(600);
      await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
      await expect(page.locator('[data-hint]')).toHaveText(HINT_HTML);
      await page.mouse.click(300, 200);
      await expect(page).toHaveURL(ENTERED);
      expect(errors).toEqual([]);
    });

    test(`${path}: a software WebGL renderer is refused and the HTML cover stays`, async ({ page }) => {
      // CI's headless Chromium renders WebGL in software (SwiftShader): seconds per frame of a ray tracer. The covers
      // ask for a hardware context (failIfMajorPerformanceCaveat) and refuse software renderers by name.
      const errors = watchErrors(page);
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attributes, ...rest) {
          if (!/webgl/i.test(type)) return getContext.call(this, type, attributes, ...rest);
          window.__webglAttributes = attributes;
          return {
            getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
            getParameter: () => 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
            RENDERER: 0x1f01,
          };
        };
      });
      await page.goto(path);
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => window.__webglAttributes?.failIfMajorPerformanceCaveat)).toBe(true);
      await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
      await page.mouse.click(300, 200);
      await expect(page).toHaveURL(ENTERED);
      expect(errors).toEqual([]);
    });
  }

  test('the archive lists every cover, and each keeps its own page', async ({ page }) => {
    const errors = watchErrors(page);
    for (const c of COVERS) {
      await page.goto('/visual');
      await expect(page.locator('h1')).toHaveText('Visual');
      await page.getByRole('link', { name: c.title, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/visual/${c.slug}$`));
      await expect(page.locator(`[data-cover-art="${c.slug}"]`)).toBeVisible();
      await page.mouse.click(200, 200);
      await expect(page).toHaveURL(ENTERED);
      await expect(page.getByRole('link', { name: 'Visual' })).toHaveAttribute('href', '/visual'); // header of the magazine
    }
    expect(errors).toEqual([]);
    expect((await page.goto('/visual/nao-existe'))?.status()).toBe(404);
  });

  test('the old /capas addresses redirect to /visual for good, in one hop', async ({ page }) => {
    const cases = [
      ['/capas', '/visual'],
      ['/capas/', '/visual'],
      ['/capas.html', '/visual'],
      ...COVERS.flatMap((c) => [
        [`/capas/${c.slug}`, `/visual/${c.slug}`],
        [`/capas/${c.slug}/`, `/visual/${c.slug}`],
        [`/capas/${c.slug}.html`, `/visual/${c.slug}`],
      ]),
    ];
    for (const [from, to] of cases) {
      const response = await page.request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(301);
      expect(new URL(response.headers().location, 'http://x').pathname, from).toBe(to);
      expect((await page.request.get(to, { maxRedirects: 0 })).status(), to).toBe(200);
    }
    expect((await page.goto('/capas/nao-existe'))?.status()).toBe(404); // redirected, then the 404 page
  });

  for (const [path, slug] of PAGES) {
    test(`${path} at 320 px: no horizontal scroll, no serious axe violation, the entry link visible`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      await expect(page.getByRole('link', { name: /Entrar na revista/ })).toBeInViewport();
      expect(await axeBlocking(page)).toEqual([]);
    });

    // The art starts only when the HTML cover fits the viewport (each cover's main.ts `fits`), so common screens must fit.
    for (const [width, height] of [[320, 568], [360, 640], [390, 844], [412, 915], [667, 375], [844, 390], [768, 1024], [1280, 720], [1366, 593], [1920, 1080]]) {
      test(`${path} fits ${width}×${height} without scrolling, so the art can start there`, async ({ page }) => {
        // Known bug, live since the cover shipped (found by V2-06's single e2e build, whose latest edition has three
        // stories): Sismograma's HTML cover is ~21 px too tall at 667×375, so the art never starts on a landscape
        // phone. Expected to fail until the cover is fixed (STATUS); it turns red once it fits.
        await page.setViewportSize({ width, height });
        await page.goto(path);
        test.fail(width === 667 && slug === 'sismograma' && await page.locator('.sg-hl').count() > 0,
          'Sismograma: 667×375 não cabe com manchetes (bug conhecido)');
        const [scroll, client] = await page.evaluate(() => [
          [document.body.scrollWidth, document.body.scrollHeight],
          [document.documentElement.clientWidth, document.documentElement.clientHeight],
        ]);
        expect(scroll[0]).toBeLessThanOrEqual(client[0] + 1);
        expect(scroll[1]).toBeLessThanOrEqual(client[1] + 1);
      });
    }

    test(`${path} on a desktop: no serious axe violation`, async ({ page }) => {
      await page.goto(path);
      expect(await axeBlocking(page)).toEqual([]);
    });
  }
});

test.describe('Transe', () => {
  const PATH = '/visual/transe';
  const live = (page) => expect(page.locator('html')).toHaveAttribute('data-art', 'live');
  const snapshot = (page) => page.locator('[data-canvas]').evaluate((canvas) => canvas.toDataURL());
  const fixedTime = new Date('2026-11-27T15:00:00Z');

  test('bursts first, lights the centre next, and opens the edition', async ({ page }) => {
    await page.clock.install({ time: fixedTime });
    await page.clock.pauseAt(new Date(fixedTime.getTime() + 1000));
    await page.goto(PATH);
    await live(page);
    const sample = () => page.locator('[data-canvas]').evaluate((canvas) => {
      const ctx = canvas.getContext('2d');
      const pixel = (x, y) => [...ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data];
      return { centre: pixel(0.5, 0.5), corner: pixel(0.02, 0.02) };
    });
    const opening = await snapshot(page);
    await page.mouse.click(110, 90);
    await expect(page.locator('html')).toHaveAttribute('data-leaving', '');
    await page.clock.runFor(130);
    expect(await snapshot(page)).not.toBe(opening);
    expect((await sample()).centre[0]).toBeLessThan(225);
    await page.clock.runFor(250);
    const flash = await sample();
    expect(flash.centre[0]).toBeGreaterThan(245);
    expect(flash.centre[3]).toBeGreaterThan(220);
    expect(flash.corner[3]).toBeLessThan(flash.centre[3]);
    await page.clock.runFor(600);
    await expect(page).toHaveURL(ENTERED);
  });

  test('opens by the deadline when animation frames stop', async ({ page }) => {
    await page.clock.install({ time: fixedTime });
    await page.clock.pauseAt(new Date(fixedTime.getTime() + 1000));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(PATH);
    await live(page);
    await page.mouse.click(110, 90);
    await expect(page.locator('html')).toHaveAttribute('data-leaving', '');
    await page.clock.runFor(850);
    await expect(page).toHaveURL(/\/visual\/transe$/);
    await page.clock.runFor(150);
    await expect(page).toHaveURL(ENTERED);
  });

  test('rests on the name after inactivity and wakes on pointer movement', async ({ page }) => {
    await page.clock.install({ time: fixedTime });
    await page.clock.pauseAt(new Date(fixedTime.getTime() + 1000));
    await page.goto(PATH);
    await live(page);
    await page.mouse.move(640, 360);
    await page.clock.fastForward(120_100);
    await expect(page.locator('html')).toHaveAttribute('data-rest', '');
    expect(await page.locator('h1').textContent()).toBe('LinkedIA');
    const still = await snapshot(page);
    await page.clock.runFor(250);
    expect(await snapshot(page)).toBe(still);
    await page.mouse.move(700, 390);
    await page.clock.runFor(200);
    await expect(page.locator('html')).not.toHaveAttribute('data-rest', /.*/);
    expect(await snapshot(page)).not.toBe(still);
  });

  test('a held touch stays on the cover; a brief tap enters', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto(PATH);
      await live(page);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 180 }] });
      await page.waitForTimeout(650);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page).toHaveURL(/\/visual\/transe$/);
      await page.touchscreen.tap(210, 330);
      await expect(page).toHaveURL(ENTERED);
    } finally {
      await context.close();
    }
  });

  test('with reduced motion it shows a still frame and enters immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PATH);
    await live(page);
    await expect(page.locator('html')).toHaveAttribute('data-rest', '');
    await page.mouse.click(110, 90);
    await expect(page).toHaveURL(ENTERED);
  });

  test('with JavaScript disabled, edition text and the entry link work', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(PATH);
      await expect(page.locator('time')).toBeVisible();
      await expect(page.locator('.transe-edition li').first()).toBeVisible();
      await page.getByRole('link', { name: /Entrar na revista/ }).click();
      await expect(page).toHaveURL(ENTERED);
    } finally {
      await context.close();
    }
  });
});

test.describe('Sismograma', () => {
  const PATH = '/visual/sismograma';
  const live = (page) => expect(page.locator('html')).toHaveAttribute('data-art', 'live');
  /** The canvas as a data URL (same origin, so the CSP allows reading it back). */
  const snapshot = (page) => page.locator('[data-canvas]').evaluate((c) => c.toDataURL());
  /** Canvas pixels with ink down the middle column, which every line crosses. */
  const ink = (page) =>
    page.locator('[data-canvas]').evaluate((c) => {
      const data = c.getContext('2d').getImageData(Math.floor(c.width / 2), 0, 1, c.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
      return n;
    });

  test('is a lab sheet: the work, the number of lines and a ruled plot hidden from assistive technology', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('.sg-work cite')).toHaveText('Sismograma');
    const lines = Number(await page.locator('[data-sg]').getAttribute('data-lines'));
    expect(lines).toBeGreaterThanOrEqual(15);
    expect(lines).toBeLessThanOrEqual(25);
    await expect(page.locator('.sg-work')).toContainText(`${lines} linhas respiram`);
    const edition = COVERS.find((cover) => cover.slug === 'sismograma').edition;
    const available = (await page.request.get(`/edicoes/${edition}`)).ok();
    if (available) {
      await expect(page.locator('.sg-work time')).toHaveAttribute('datetime', edition);
      await expect(page.locator('.sg-hl')).not.toHaveCount(0);
    } else {
      await expect(page.locator('.sg-work time')).toHaveCount(0);
      await expect(page.locator('.sg-empty')).toHaveText('Nenhuma edição publicada ainda.');
    }
    await expect(page.locator('[data-room]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-chart]')).toHaveAttribute('aria-hidden', 'true');
  });

  test('the sheet is plotted and keeps moving; a second look differs from the first', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(PATH);
    await live(page);
    await expect(page.locator('[data-hint]')).not.toHaveText(HINT_HTML); // the live hint tells how to play
    await page.waitForTimeout(2200); // the pen is done
    expect(await ink(page)).toBeGreaterThan(14); // every line crosses the middle
    const first = await snapshot(page);
    await page.waitForTimeout(500);
    expect(await snapshot(page)).not.toBe(first);
    await expect(page.locator('html')).not.toHaveAttribute('data-rest', /.*/);
    expect(errors).toEqual([]);
  });

  test('without JS the sheet, its ruled poster and the entry link still work', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PATH);
    await expect(page.locator('h1')).toHaveText('LinkedIA');
    await expect(page.locator('.sg-poster')).toBeVisible();
    await expect(page.locator('[data-hint]')).toHaveText(HINT_HTML);
    await page.getByRole('link', { name: /Entrar na revista/ }).click();
    await expect(page).toHaveURL(ENTERED);
    await context.close();
  });

  test('forced colours keep the HTML cover, in the system colours', async ({ browser }) => {
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await page.goto(PATH);
    await page.waitForTimeout(600);
    await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
    await expect(page.locator('[data-room]')).toBeHidden(); // no paper effects under the system colours
    const [text, background] = await page.locator('h1').evaluate((h1) => [
      getComputedStyle(h1).color,
      getComputedStyle(document.body).backgroundColor,
    ]);
    expect(text).not.toBe(background);
    await page.mouse.click(400, 300);
    await expect(page).toHaveURL(ENTERED);
    await context.close();
  });

  test('reduced motion: one still sheet, the plain hint and entry at once', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(PATH);
    await live(page);
    await expect(page.locator('html')).toHaveAttribute('data-rest', '');
    await expect(page.locator('[data-hint]')).toHaveText(HINT_HTML);
    expect(await ink(page)).toBeGreaterThan(14);
    const first = await snapshot(page);
    await page.mouse.move(500, 300); // no lens, no wave
    await page.waitForTimeout(500);
    expect(await snapshot(page)).toBe(first);
    await page.mouse.click(500, 300);
    await expect(page.locator('html')).not.toHaveAttribute('data-leaving', /.*/); // no exit animation
    await expect(page).toHaveURL(ENTERED);
    await context.close();
  });

  test('a long press launches a wave and stays, a drag stays, a tap plays the exit and enters', async ({ page }) => {
    await page.goto(PATH);
    await live(page);
    await page.waitForTimeout(2200);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.waitForTimeout(800); // longer than the long press
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
    await expect(page.locator('html')).not.toHaveAttribute('data-leaving', /.*/);
    await page.mouse.down();
    await page.mouse.move(900, 300, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
    await page.mouse.click(640, 360);
    await expect(page.locator('html')).toHaveAttribute('data-leaving', '');
    await expect(page).toHaveURL(ENTERED);
  });

  test('with the art live, every point enters except the fine-print links, which keep working', async ({ page }) => {
    await page.goto(PATH);
    await live(page);
    const hits = await page.evaluate(() => {
      const name = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('a')?.textContent?.trim() ?? el?.tagName ?? null;
      };
      const chart = document.querySelector('[data-chart]').getBoundingClientRect();
      const title = document.querySelector('h1').getBoundingClientRect();
      const other = document.querySelector('a[href="/visual"]').getBoundingClientRect();
      return {
        chart: name(chart.left + chart.width / 2, chart.top + chart.height / 2),
        title: name(title.left + 10, title.top + title.height / 2),
        other: name(other.left + 4, other.top + other.height / 2),
      };
    });
    expect(hits.chart).toMatch(/^Entrar na revista/);
    expect(hits.title).toMatch(/^Entrar na revista/);
    expect(hits.other).toBe('Outras capas');
    const z = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.sg-text')).zIndex,
      getComputedStyle(document.querySelector('[data-room]')).zIndex,
    ]);
    expect(Number(z[0])).toBeGreaterThan(Number(z[1])); // the text stays above the art
  });

  test('Back from the magazine plots a new sheet, not the erased one', async ({ page }) => {
    await page.goto(PATH);
    await live(page);
    await page.mouse.click(640, 360);
    await expect(page).toHaveURL(ENTERED);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
    await live(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-leaving', /.*/);
    await page.waitForTimeout(2200);
    expect(await ink(page)).toBeGreaterThan(14);
    await page.mouse.click(640, 360);
    await expect(page).toHaveURL(ENTERED);
  });

  test('a window too small returns the HTML cover; a larger one starts the art again', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(PATH);
    await live(page);
    await page.setViewportSize({ width: 300, height: 220 }); // the sheet no longer fits: it scrolls
    await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
    await expect(page.locator('[data-hint]')).toHaveText(HINT_HTML);
    await page.setViewportSize({ width: 1024, height: 700 });
    await live(page);
    await page.waitForTimeout(2200);
    expect(await ink(page)).toBeGreaterThan(14);
    expect(errors).toEqual([]);
  });
});

test.describe('Duas sombras', () => {
  const PATH = '/visual/duas-sombras';

  test('is a museum label beside a gallery poster, carved for its edition', async ({ page }) => {
    await page.goto(PATH);
    const label = page.locator('.ds-label');
    await expect(label.locator('cite')).toHaveText('Duas sombras');
    await expect(label).toContainText('as sombras dizem IA e DIA');
    await expect(page.locator('[data-room]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.ds-wall-left .ds-word')).toHaveText('IA');
    await expect(page.locator('.ds-wall-right .ds-word')).toHaveText('DIA');
    const params = await page.locator('[data-ds]').evaluate((el) => ({ ...el.dataset }));
    for (const key of ['theta', 'spacing', 'thickness', 'phase']) expect(Number.isFinite(Number(params[key])), key).toBe(true);
    expect(Number(params.theta)).toBeGreaterThanOrEqual(30);
    expect(Number(params.theta)).toBeLessThanOrEqual(60);
  });

  test('without JS the label, the poster and the entry link still work', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PATH);
    await expect(page.locator('h1')).toHaveText('LinkedIA');
    await expect(page.locator('.ds-wall-right .ds-word')).toBeVisible();
    await page.getByRole('link', { name: /Entrar na revista/ }).click();
    await expect(page).toHaveURL(ENTERED);
    await context.close();
  });

  test('forced colours keep the HTML cover even with WebGL, in the system colours', async ({ browser }) => {
    // axe's colour-contrast rule does not model forced colours (it flags every page of the site there), so this checks
    // what the browser actually paints: the label's text and background are the system pair.
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await withWebgl(page);
    await page.goto(PATH);
    await page.waitForTimeout(600);
    await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
    const [text, background] = await page.locator('.ds-label h1').evaluate((h1) => [
      getComputedStyle(h1).color,
      getComputedStyle(h1.closest('.ds-label')).backgroundColor,
    ]);
    expect(text).not.toBe(background);
    await page.mouse.click(400, 300);
    await expect(page).toHaveURL(ENTERED);
    await context.close();
  });

  test('with the art live, every point enters except the fine-print links, which keep working', async ({ page }) => {
    // Headless Chromium has no WebGL: switch the page to its live layout by hand and hit-test it.
    await page.goto(PATH);
    await page.evaluate(() => {
      document.documentElement.dataset.art = 'live';
    });
    const hits = await page.evaluate(() => {
      const name = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('a')?.textContent?.trim() ?? el?.tagName ?? null;
      };
      const room = document.querySelector('[data-room]').getBoundingClientRect();
      const label = document.querySelector('.ds-label h1').getBoundingClientRect();
      const other = document.querySelector('a[href="/visual"]').getBoundingClientRect();
      return {
        room: name(room.left + room.width / 2, room.top + room.height / 2),
        label: name(label.left + 10, label.top + label.height / 2),
        other: name(other.left + 4, other.top + other.height / 2),
      };
    });
    expect(hits.room).toMatch(/^Entrar na revista/);
    expect(hits.label).toMatch(/^Entrar na revista/);
    expect(hits.other).toBe('Outras capas');
  });

  test('the label stays above the art and readable while the gallery is the background', async ({ page }) => {
    await page.goto(PATH);
    const z = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.ds-label')).zIndex,
      getComputedStyle(document.querySelector('[data-canvas]')).zIndex,
    ]);
    expect(Number(z[0])).toBeGreaterThan(Number(z[1]));
    expect(await axeBlocking(page)).toEqual([]);
  });
});

test.describe('Singularidade painting', () => {
  // The black hole bends a bitmap painted from the HTML (singularidade/snapshot.ts); before the hole appears the two
  // must match, or the art would visibly jump when it takes over. `#pintura` shows that bitmap flat over the page.
  const PATH = '/visual/singularidade';

  test('the painted bitmap matches the HTML cover', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(PATH);
    await page.evaluate(() => document.body.style.setProperty('background-image', 'none')); // the dots are the shader's (CSSOM: the CSP allows it)
    const html = await page.screenshot();
    await page.goto(`${PATH}#pintura`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-art', 'pintura');
    const painted = await page.screenshot();

    const blank = await browser.newPage();
    const diff = await blank.evaluate(
      async ([a, b]) => {
        const load = (src) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:image/png;base64,${src}`;
          });
        const pixels = async (src) => {
          const img = await load(src);
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, c.width, c.height).data;
        };
        const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
        let off = 0;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
          if (d > 64) off++;
        }
        return off / (pa.length / 4);
      },
      [html.toString('base64'), painted.toString('base64')],
    );
    await blank.close();
    expect(diff).toBeLessThan(0.01); // under 1% of pixels differ visibly (anti-aliasing at glyph edges)
  });
});
