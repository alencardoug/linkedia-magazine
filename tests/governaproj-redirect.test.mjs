// GovernaProj on its own site (V2-02b, map in gproj `docs/URLS.md`): every old URL of the magazine's snapshot
// redirects to the matching page of https://governaproj.web.app, nothing else under the old route does (no loop, an
// unknown path stays 404), and the old snapshot's `assets/<hash>/` stays served unchanged, so a page opened or cached
// before the switch still loads its modules. Local checks only: no request to the remote site.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_HASH as HASH, OLD_TO_NEW, ROUTE, SITE } from '../e2e/fixtures/governanca-de-projetos-legado/urls.mjs';
import { SPECIALS, specialHref } from '../src/lib/specials';

const ROOT = resolve(import.meta.dirname, '..');
const LEGACY = join(ROOT, 'public', 'especiais', 'governanca-de-projetos');
const FIXTURES = join(ROOT, 'e2e', 'fixtures', 'governanca-de-projetos-legado');
const { redirects } = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8')).hosting;

/** The first matching rule, as Hosting applies it (the regexes use only the RE2 subset JS shares). */
const match = (path) => redirects.find((r) => (r.regex ? new RegExp(r.regex).test(path) : r.source === path));

const files = (dir, prefix = '') =>
  readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(dir, join(prefix, e.name)) : [join(prefix, e.name).split('\\').join('/')],
  );

describe('GovernaProj redirect switch', () => {
  it('sends every mapped old URL to its page on the new site, permanently (owner accepted the switch, 2026-11-25)', () => {
    for (const [from, to] of Object.entries(OLD_TO_NEW)) {
      const rule = match(from);
      expect(rule?.destination, from).toBe(to);
      expect(rule.type, from).toBe(301);
    }
  });

  it('leaves the legacy assets, unknown paths and the other specials alone', () => {
    for (const path of [
      `${ROUTE}/assets/${HASH}/app.mjs`,
      `${ROUTE}/qualquer`,
      `${ROUTE}/guia-completo/extra`,
      `${ROUTE}x`,
      '/especiais/perguntar-ao-banco',
    ]) {
      expect(match(path), path).toBeUndefined();
    }
    // Its rules point only at the new origin: nothing points back at the magazine.
    for (const r of redirects.filter((r) => r.regex.startsWith(`^${ROUTE}`))) expect(r.destination.startsWith(`${SITE}/`)).toBe(true);
  });

  it('lists the guide on /edicoes at its canonical URL', () => {
    expect(specialHref(SPECIALS.find((s) => s.slug === 'governanca-de-projetos'))).toBe(`${SITE}/`);
  });

  it('keeps the old asset folder byte for byte, and the old pages as fixtures that load only from it', () => {
    expect(readdirSync(LEGACY)).toEqual(['assets']);
    expect(readdirSync(join(LEGACY, 'assets'))).toEqual([HASH]);
    const dir = join(LEGACY, 'assets', HASH);
    const hash = createHash('sha256');
    for (const name of files(dir).sort()) hash.update(name + '\0').update(readFileSync(join(dir, name))).update('\0');
    expect(hash.digest('hex').slice(0, 16)).toBe(HASH);
    for (const page of ['mapa.html', 'guia-completo.html']) {
      const html = readFileSync(join(FIXTURES, page), 'utf8');
      const assets = [...html.matchAll(/(?:src|href)="(\/[^"#]*\.(?:m?js|css))"/g)].map((m) => m[1]);
      expect(assets.length, page).toBeGreaterThan(0);
      for (const a of assets) expect(a.startsWith(`${ROUTE}/assets/${HASH}/`), a).toBe(true);
    }
  });
});
