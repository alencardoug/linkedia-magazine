// Fast-path smoke (V2-01): runs instead of the full e2e suite when a push changes only exported content
// (scripts/ci/classify-changes.mjs). Served by the Hosting emulator from the production build (real content), so
// it checks the exact output that deploys. LINKEDIA_SMOKE_FILES lists the changed content paths, one per line.
// - entry: the cover answers with the CSP, links to /revista, and every same-origin asset it references loads
//   (no graphics checks: the art is not waited for);
// - each changed article: its text is rendered escaped (title/summary as text, no script in the content), every
//   citation points at a listed source and every source links to the exported URL;
// - the changed article, edition, category pages plus /revista and /edicoes: 200, CSP, one h1, no page errors,
//   internal links resolve, axe serious/critical 0, no horizontal scroll at 320 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const FILES = (process.env.LINKEDIA_SMOKE_FILES ?? '')
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const articles = FILES.filter((f) => f.startsWith('content/articles/')).map(read);
const editions = FILES.filter((f) => f.startsWith('content/editions/')).map((f) => read(f).edition_date);
const articlePath = (a) => `/materias/${a.slug}`;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function expectPage(page, path) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  expect(new URL(page.url()).pathname, `${path} redirected`).toBe(path);
  expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
}

// Every page to check: the changed ones and the ones that list them. Category pages are discovered from the
// article pages' own links, so this spec keeps no copy of the channel → route map.
async function pagesToCheck(page) {
  const pages = new Set(['/revista', '/edicoes']);
  for (const date of editions) pages.add(`/edicoes/${date}`);
  for (const a of articles) {
    pages.add(articlePath(a));
    pages.add(`/edicoes/${a.edition_date}`);
    await page.goto(articlePath(a));
    for (const href of await page.locator('a[href^="/categorias/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href'))))
      pages.add(href);
  }
  return [...pages].sort();
}

test('the change list is not empty', () => {
  expect(FILES.length).toBeGreaterThan(0);
});

test('entry: the cover links to /revista and its assets load', async ({ page, request }) => {
  const errors = watchErrors(page);
  await expectPage(page, '/');
  await expect(page.locator('a[href="/revista"]').first()).toBeAttached();
  const assets = await page.evaluate(() =>
    [
      ...[...document.querySelectorAll('script[src]')].map((e) => e.src),
      ...[...document.querySelectorAll('link[href]')].filter((e) => /stylesheet|preload|modulepreload|icon/.test(e.rel)).map((e) => e.href),
      ...[...document.querySelectorAll('img[src]')].map((e) => e.src),
    ].filter((u) => new URL(u).origin === location.origin),
  );
  expect(assets.length).toBeGreaterThan(0);
  for (const url of new Set(assets)) expect((await request.get(url)).status(), url).toBe(200);
  expect(errors).toEqual([]);
});

for (const a of articles) {
  test(`article ${a.slug}: escaped text, citations and sources`, async ({ page }) => {
    await expectPage(page, articlePath(a));
    await expect(page.locator('h1')).toHaveText(a.title); // a tag in the title shows as text, not markup
    await expect(page.getByText(a.summary, { exact: true }).first()).toBeVisible();
    // Only the site's own bundled modules (the copy button) may sit in the article; content never adds markup.
    await expect(page.locator('main script:not([src^="/_astro/"]), main iframe, main object, main embed')).toHaveCount(0);
    const sourceIds = new Set(a.sources.map((s) => s.source_id));
    const cited = new Set(a.blocks.flatMap((b) => b.source_ids ?? []));
    for (const id of cited) expect(sourceIds.has(id), `block cites unknown ${id}`).toBe(true);
    const anchors = await page.locator('a[href^="#fonte-"]').evaluateAll((els) => els.map((e) => e.getAttribute('href').slice(7)));
    expect(new Set(anchors)).toEqual(cited);
    for (const s of a.sources) {
      await expect(page.locator(`[id="fonte-${s.source_id}"] a`)).toHaveAttribute('href', s.url);
    }
  });
}

test('changed and listing pages: status, CSP, errors, links, axe', async ({ page, request }) => {
  test.setTimeout(120_000);
  const checked = new Set();
  for (const path of await pagesToCheck(page)) {
    const errors = watchErrors(page);
    await expectPage(page, path);
    await expect(page.locator('h1')).toHaveCount(1);
    const links = await page.locator('a[href^="/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href').split('#')[0]));
    for (const href of new Set(links)) {
      if (checked.has(href)) continue;
      checked.add(href);
      expect((await request.get(href)).status(), `${path} → ${href}`).toBeLessThan(400);
    }
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}`);
    expect(blocking).toEqual([]);
    expect(errors, path).toEqual([]);
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
  }
});

test.describe('320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('no horizontal scroll on the changed and listing pages', async ({ page }) => {
    for (const path of await pagesToCheck(page)) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
    }
  });
});
