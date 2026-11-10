// Standalone special "Governança de Projetos" (owner, 2026-11-10): the checked-in snapshot in `public/` stays
// consistent with `scripts/snapshot-governanca-de-projetos.mjs` (an edited module without a new hash would be
// served under an old directory name), and ships only the intended public files.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPECIALS } from '../src/lib/specials';
import { assetHash, files, ROUTE, SLUG } from '../scripts/snapshot-governanca-de-projetos.mjs';

const PUBLIC = resolve(import.meta.dirname, '../public');
const DIR = join(PUBLIC, 'especiais', SLUG);

describe('governança de projetos snapshot', () => {
  const [hash, ...extra] = readdirSync(join(DIR, 'assets'));
  const assets = new Map(files(join(DIR, 'assets', hash)).map((n) => [n, readFileSync(join(DIR, 'assets', hash, n))]));

  it('ships only the two pages, the JSON and one hashed asset directory named after its bytes', () => {
    expect(extra).toEqual([]);
    expect(files(join(PUBLIC, 'especiais')).filter((f) => !f.startsWith(`${SLUG}/assets/`)).sort()).toEqual(
      [`${SLUG}.html`, `${SLUG}/conteudo.json`, `${SLUG}/guia-completo.html`].sort(),
    );
    expect([...assets.keys()].every((n) => /^[\w/-]+\.(?:m?js|css)$/.test(n))).toBe(true);
    expect(assetHash(assets)).toBe(hash);
  });

  it('points both pages at that directory and is registered as a standalone special', () => {
    for (const page of [`${SLUG}.html`, `${SLUG}/guia-completo.html`]) {
      const html = readFileSync(join(PUBLIC, 'especiais', page), 'utf8');
      const dirs = new Set([...html.matchAll(/\/assets\/([0-9a-f]{16})\//g)].map((m) => m[1]));
      expect([...dirs], page).toEqual([hash]);
      expect(html, page).not.toContain('name="robots"');
    }
    expect(SPECIALS.find((s) => `/especiais/${s.slug}` === ROUTE)?.standalone).toBe(true);
  });

  it('carries no local path, credential or private marker', () => {
    const texts = [
      ...[...assets.values()].map((b) => b.toString('utf8')),
      ...[`${SLUG}.html`, `${SLUG}/guia-completo.html`, `${SLUG}/conteudo.json`].map((p) =>
        readFileSync(join(PUBLIC, 'especiais', p), 'utf8'),
      ),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/\/home\/|file:\/\/|127\.0\.0\.1|localhost|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key/i);
    }
  });
});
