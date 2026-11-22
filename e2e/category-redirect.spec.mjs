// The two v1 category slugs merged into "IA na prática" (V2-05, D-084) on the Hosting emulator: each answers 301 to
// the merged page, with or without .html or a trailing slash, and the merged page itself is served (no loop).
import { expect, test } from '@playwright/test';

test('the retired v1 category URLs redirect (301) to /categorias/ia-na-pratica', async ({ request }) => {
  for (const slug of ['engenharia-de-ia', 'conhecimento-de-ia']) {
    for (const from of [`/categorias/${slug}`, `/categorias/${slug}/`, `/categorias/${slug}.html`]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(301);
      expect(new URL(res.headers().location, 'http://x').pathname, from).toBe('/categorias/ia-na-pratica');
    }
  }
  const merged = await request.get('/categorias/ia-na-pratica', { maxRedirects: 0 });
  expect(merged.status()).toBe(200);
  expect(await merged.text()).toContain('<h1>IA na prática</h1>');
});
