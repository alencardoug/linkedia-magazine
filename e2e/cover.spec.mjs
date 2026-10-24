// Cover pre-pages (3-01, docs/COVERS.md) on the Hosting emulator: `/` (the current cover) and every archived cover at
// `/visual/<slug>`. Headless Chromium has no WebGL here, so these specs exercise the HTML cover that every device gets
// first (and keeps without WebGL2): entry by click, tap or key from anywhere, the skip link, the fine-print links,
// drag versus tap, Back, the archive, a broken or software WebGL context, 320 px, the viewports where the art may
// start, and axe — on every cover page — plus each cover's own checks (Singularidade's `#pintura` bitmap against the
// HTML it is painted from; Duas sombras' museum label). The WebGL art itself is accepted on a real GPU
// (docs/COVERS.md, "Acceptance").
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
      await expect(page.locator('html')).not.toHaveAttribute('data-art', /./); // no WebGL: the HTML cover stays
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

  for (const [path] of PAGES) {
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

  for (const [path] of PAGES) {
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
        await page.setViewportSize({ width, height });
        await page.goto(path);
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
