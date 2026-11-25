// GovernaIA on its own site (V2-13b, map in gia `docs/URLS.md`): every old URL of the AI guide and its showcase
// redirects to the matching page of https://governaia.web.app, nothing else under the old routes does (no loop, an
// unknown path stays 404), the old `esquema.js` stays served unchanged, and the magazine keeps no page, source or
// test of the two. Local checks only: no request to the remote site.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OLD_TO_NEW, ROUTE, SCHEME_SCRIPT, SCHEME_SCRIPT_SHA256, SHOWCASE, SITE } from '../e2e/fixtures/governaia-urls.mjs';
import { SPECIALS, specialHref } from '../src/lib/specials';

const ROOT = resolve(import.meta.dirname, '..');
const { redirects } = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8')).hosting;

/** The first matching rule, as Hosting applies it (the regexes use only the RE2 subset JS shares). */
const match = (path) => redirects.find((r) => (r.regex ? new RegExp(r.regex).test(path) : r.source === path));

const files = (dir) =>
  readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(ROOT.length + 1));

describe('GovernaIA redirect switch', () => {
  it('sends every mapped old URL to its page on the new site, temporarily while validating', () => {
    for (const [from, to] of Object.entries(OLD_TO_NEW)) {
      const rule = match(from);
      expect(rule?.destination, from).toBe(to);
      expect(rule.type, from).toBe(302);
    }
  });

  it('leaves the old scheme script, unknown paths and the other specials alone', () => {
    for (const path of [
      SCHEME_SCRIPT,
      `${ROUTE}/qualquer`,
      `${ROUTE}x`,
      `${SHOWCASE}/extra`,
      `${SHOWCASE}x`,
      '/especiais/dez-layouts',
      '/especiais/perguntar-ao-banco',
      '/_astro/governanca-de-ia.abc123.css',
    ]) {
      expect(match(path), path).toBeUndefined();
    }
    // Its rules point only at the new origin: nothing points back at the magazine.
    const own = redirects.filter((r) => r.regex.startsWith(`^${ROUTE}`) || r.regex.startsWith(`^${SHOWCASE}`));
    expect(own).toHaveLength(2);
    for (const r of own) expect(r.destination.startsWith(`${SITE}/`), r.regex).toBe(true);
  });

  it('lists the guide and the showcase on /edicoes at their canonical URLs, in the same order', () => {
    const slugs = SPECIALS.map((s) => s.slug);
    expect(specialHref(SPECIALS.find((s) => s.slug === 'governanca-de-ia'))).toBe(`${SITE}/`);
    expect(specialHref(SPECIALS.find((s) => s.slug === 'dez-layouts-governanca-de-ia'))).toBe(`${SITE}/dez-layouts`);
    expect(slugs).toEqual(['governanca-de-ia', 'governanca-de-projetos', 'perguntar-ao-banco', 'dez-layouts-governanca-de-ia']);
    // A special with its own site has no page here, so it cannot be art-directed on the magazine's shell.
    for (const s of SPECIALS.filter((s) => s.href)) expect(s.artDirected, s.slug).toBeUndefined();
  });

  it('keeps esquema.js byte for byte and nothing else of the guide', () => {
    expect(files('public/especiais/governanca-de-ia')).toEqual(['public/especiais/governanca-de-ia/esquema.js']);
    const body = readFileSync(join(ROOT, 'public', SCHEME_SCRIPT));
    expect(createHash('sha256').update(body).digest('hex')).toBe(SCHEME_SCRIPT_SHA256);
    for (const gone of [
      'src/pages/especiais/governanca-de-ia.astro',
      'src/pages/especiais/dez-layouts-governanca-de-ia.astro',
      'src/specials/governanca-de-ia',
      'src/specials/dez-layouts',
      'e2e/governanca-de-ia.spec.mjs',
    ]) {
      expect(existsSync(join(ROOT, gone)), gone).toBe(false);
    }
  });

  it('keeps what the NL→SQL special still uses: its shell and the Lucide icons with their licence', () => {
    const page = readFileSync(join(ROOT, 'src/pages/especiais/perguntar-ao-banco.astro'), 'utf8');
    expect(page).toContain("import SpecialLayout from '../../layouts/SpecialLayout.astro';");
    expect(page).toContain("import Icon from '../../specials/icones/Icon.astro';");
    expect(files('src/specials/icones').sort()).toEqual(
      ['Icon.astro', 'LICENSE-lucide.txt', 'icons.ts'].map((f) => `src/specials/icones/${f}`).sort(),
    );
    // No source left in the magazine imports the guide's old folder.
    for (const f of files('src')) {
      if (/\.(?:astro|ts|mjs|css)$/.test(f)) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toContain('specials/governanca-de-ia');
    }
  });
});
