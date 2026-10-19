// Cover pre-page (3-01, docs/COVERS.md) on the Hosting emulator. Headless Chromium has no WebGL here, so these specs
// exercise the HTML cover that every device gets first (and keeps without WebGL2): entry by click, tap or key from
// anywhere, the skip link, the fine-print links, drag versus tap, Back, the archive, a broken WebGL context, and the
// fidelity of the bitmap the renderer would bend (`#pintura`) against the HTML it is painted from. The WebGL art
// itself is accepted on a real GPU (docs/COVERS.md, "Acceptance").
import { expect, test } from '@playwright/test';
import { axeBlocking, watchErrors, withWebgl } from './helpers.mjs';

const COVER = '/';
const ENTERED = /\/revista$/;

test.describe('cover', () => {
  test('renders the cover with the strict CSP, an h1, its fine print and no errors', async ({ page }) => {
    const errors = watchErrors(page);
    const response = await page.goto(COVER);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
    await expect(page.locator('html')).toHaveAttribute('data-cover', 'singularidade');
    await expect(page.locator('h1')).toHaveText('LinkedIA');
    await expect(page.locator('a[rel="author"]')).toHaveCount(0); // the editor is named on /sobre only
    await expect(page.getByText('Textos gerados com IA')).toHaveCount(0); // the AI note is on /revista only
    await expect(page.getByRole('link', { name: 'Outras capas' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Entrar na revista/ })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-art', /./); // no WebGL: the HTML cover stays
    expect(errors).toEqual([]);
  });

  for (const [name, x, y] of [
    ['the masthead', 0.5, 0.45],
    ['a corner', 0.03, 0.03],
    ['the headlines', 0.3, 0.8],
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

  test('a WebGL context that cannot draw leaves the HTML cover, with no page error', async ({ page }) => {
    const errors = watchErrors(page);
    await withWebgl(page);
    await page.goto(COVER);
    await page.waitForTimeout(600);
    await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
    await expect(page.locator('[data-hint]')).toHaveText('Clique ou toque em qualquer lugar para entrar.');
    await page.mouse.click(300, 200);
    await expect(page).toHaveURL(ENTERED);
    expect(errors).toEqual([]);
  });

  test('a software WebGL renderer is refused and the HTML cover stays', async ({ page }) => {
    // CI's headless Chromium renders WebGL in software (SwiftShader): seconds per frame of the ray tracer. The cover
    // asks for a hardware context (failIfMajorPerformanceCaveat) and refuses software renderers by name.
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
    await page.goto(COVER);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__webglAttributes?.failIfMajorPerformanceCaveat)).toBe(true);
    await expect(page.locator('html')).not.toHaveAttribute('data-art', /./);
    await page.mouse.click(300, 200);
    await expect(page).toHaveURL(ENTERED);
    expect(errors).toEqual([]);
  });

  test('the archive lists the cover, which keeps its own page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/visual');
    await expect(page.locator('h1')).toHaveText('Visual');
    await page.getByRole('link', { name: 'Singularidade' }).click();
    await expect(page).toHaveURL(/\/visual\/singularidade$/);
    await expect(page.locator('[data-cover-art="singularidade"]')).toBeVisible();
    await page.mouse.click(200, 200);
    await expect(page).toHaveURL(ENTERED);
    await expect(page.getByRole('link', { name: 'Visual' })).toHaveAttribute('href', '/visual'); // header of the magazine
    expect(errors).toEqual([]);
    expect((await page.goto('/visual/nao-existe'))?.status()).toBe(404);
  });

  test('the old /capas addresses redirect to /visual for good, in one hop', async ({ page }) => {
    const cases = [
      ['/capas', '/visual'],
      ['/capas/', '/visual'],
      ['/capas.html', '/visual'],
      ['/capas/singularidade', '/visual/singularidade'],
      ['/capas/singularidade/', '/visual/singularidade'],
      ['/capas/singularidade.html', '/visual/singularidade'],
    ];
    for (const [from, to] of cases) {
      const response = await page.request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(301);
      expect(new URL(response.headers().location, 'http://x').pathname, from).toBe(to);
      expect((await page.request.get(to, { maxRedirects: 0 })).status(), to).toBe(200);
    }
    expect((await page.goto('/capas/nao-existe'))?.status()).toBe(404); // redirected, then the 404 page
  });

  test('320 px: no horizontal scroll, no serious axe violation, the entry link visible', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(COVER);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(page.getByRole('link', { name: /Entrar na revista/ })).toBeInViewport();
    expect(await axeBlocking(page)).toEqual([]);
  });

  // The art starts only when the HTML cover fits the viewport (main.ts `fits`), so common screens must fit.
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [412, 915], [667, 375], [844, 390], [768, 1024], [1280, 720], [1366, 593], [1920, 1080]]) {
    test(`fits ${width}×${height} without scrolling, so the art can start there`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(COVER);
      const [scroll, client] = await page.evaluate(() => [
        [document.body.scrollWidth, document.body.scrollHeight],
        [document.documentElement.clientWidth, document.documentElement.clientHeight],
      ]);
      expect(scroll[0]).toBeLessThanOrEqual(client[0] + 1);
      expect(scroll[1]).toBeLessThanOrEqual(client[1] + 1);
    });
  }

  test('desktop: no serious axe violation', async ({ page }) => {
    await page.goto(COVER);
    expect(await axeBlocking(page)).toEqual([]);
  });
});

test.describe('cover painting', () => {
  // The renderer bends a bitmap painted from the HTML (snapshot.ts); before the hole appears the two must match, or
  // the art would visibly jump when it takes over. `#pintura` shows that bitmap flat over the page.
  test('the painted bitmap matches the HTML cover', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(COVER);
    await page.evaluate(() => document.body.style.setProperty('background-image', 'none')); // the dots are the shader's (CSSOM: the CSP allows it)
    const html = await page.screenshot();
    await page.goto(`${COVER}#pintura`);
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
