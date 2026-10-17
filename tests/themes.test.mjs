// themes/manifest.json (D-025): the bootstrap manifest is valid, slot rules reject broken manifests, and every
// slotted lab theme is a scoped, budgeted package (1C-01).
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkThemeCss, slots, THEME_CSS_BUDGET } from '../scripts/themes.mjs';
import { validateThemes } from '../scripts/validate-content.mjs';

const MANIFEST = resolve(import.meta.dirname, '../themes/manifest.json');
const FIXTURES = resolve(import.meta.dirname, 'fixtures/themes');
const dir = mkdtempSync(join(tmpdir(), 'linkedia-themes-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function variant(mutate) {
  const doc = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  mutate(doc);
  const path = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(doc));
  return path;
}

describe('theme manifest', () => {
  it('bootstraps with the baseline only and empty slots', () => {
    expect(validateThemes()).toEqual([]);
    const doc = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    expect([doc.current_theme_id, doc.previous_theme_id, doc.week_id]).toEqual([null, null, null]);
  });

  it('rejects a slot pointing at a missing theme, a previous without current, and a dropped baseline', () => {
    expect(validateThemes(variant((d) => (d.current_theme_id = 'lab-2026-w43')))).toEqual([
      expect.stringContaining('current_theme_id "lab-2026-w43" não é um tema ativo'),
    ]);
    const previousOnly = variant((d) => {
      d.previous_theme_id = 'lab-2026-w43';
      d.themes.push({ id: 'lab-2026-w43', kind: 'lab', title: 'Lab', status: 'active' });
    });
    expect(validateThemes(previousOnly)).toEqual([expect.stringContaining('previous_theme_id sem current_theme_id')]);
    expect(validateThemes(variant((d) => (d.themes[0].status = 'disabled')))).toEqual([
      expect.stringContaining('minimal-dark ausente ou inativo'),
    ]);
  });
});

// A copy of the fixture themes dir, changed by `mutate(dir, manifest)`; returns the manifest path.
function fixtureVariant(mutate = () => {}) {
  const copy = mkdtempSync(join(dir, 'fixture-'));
  cpSync(FIXTURES, copy, { recursive: true });
  const path = join(copy, 'manifest.json');
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  mutate(copy, doc);
  writeFileSync(path, JSON.stringify(doc));
  return path;
}

describe('lab theme packages', () => {
  it('accepts the fixture themes and exposes three slots', () => {
    expect(validateThemes(join(FIXTURES, 'manifest.json'))).toEqual([]);
    const s = slots(JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')));
    expect(s.baseline).toEqual({ id: 'minimal-dark', title: 'Minimal Dark', requires: null });
    expect(s.previous).toEqual({ id: 'lab-2099-w01', title: 'Fixture Light', requires: null });
    expect(s.current).toEqual({ id: 'lab-2099-w02', title: 'Fixture Motion', requires: ['motion'] });
  });

  it.each([
    ['a missing theme.css', (d) => unlinkSync(join(d, 'lab-2099-w01/theme.css')), 'lab-2099-w01: theme.css ausente'],
    ['a missing README', (d) => unlinkSync(join(d, 'lab-2099-w01/README.md')), 'lab-2099-w01: README.md ausente'],
    ['a declared enhancement without module', (d) => unlinkSync(join(d, 'lab-2099-w02/enhance.ts')), 'enhancement declarado sem enhance.ts'],
    ['a module the manifest does not declare', (_, m) => delete m.themes[2].enhancement, 'enhance.ts existe mas o manifesto não declara'],
    ['an unscoped rule', (d) => writeFileSync(join(d, 'lab-2099-w01/theme.css'), 'body { color: red }'), 'seletor fora do escopo do tema: body'],
    ['the same theme in both slots', (_, m) => (m.previous_theme_id = 'lab-2099-w02'), 'previous_theme_id igual a current_theme_id'],
    ['an active lab outside the slots', (_, m) => (m.previous_theme_id = null), 'lab-2099-w01 está ativo mas não ocupa um slot'],
    ['an enhancement on the baseline', (_, m) => (m.themes[0].enhancement = { requires: [] }), 'o baseline não tem enhancement'],
    ['a lab marked as baseline', (_, m) => (m.themes[1].kind = 'baseline'), 'kind errado para lab-2099-w01'],
    ['an unknown requirement', (_, m) => (m.themes[2].enhancement.requires = ['gpu']), '/themes/2/enhancement/requires/0'],
  ])('rejects %s', (_, mutate, message) => {
    expect(validateThemes(fixtureVariant(mutate))).toEqual(expect.arrayContaining([expect.stringContaining(message)]));
  });

  it('checks only slotted packages: an archived theme may keep or drop its files', () => {
    const path = fixtureVariant((_, m) => {
      m.themes.push({ id: 'lab-2099-w00', kind: 'lab', title: 'Old', status: 'archived' });
    });
    expect(validateThemes(path)).toEqual([]);
  });
});

describe('lab stylesheet isolation', () => {
  const ID = 'lab-2099-w05';
  const errors = (css) => checkThemeCss(ID, css, 't.css');

  it('accepts rules scoped to the theme, in conditional at-rules too, and nested rules', () => {
    const css = `
      :root[data-theme='${ID}'] { --bg: #000; }
      :root[data-theme="${ID}"] body, :root[data-theme='${ID}']:has(main) [data-card] { color: red }
      :root[data-theme='${ID}'] [data-card] { & h2 { color: blue } &:hover, > p { color: red } }
      :root[data-theme='${ID}'] main { @media (min-width: 1px) { & a { color: red } } }
      @media (min-width: 40rem) { :root[data-theme='${ID}'] main { max-width: 80ch } }
      @supports (display: grid) { @container (min-width: 1px) { :root[data-theme='${ID}'] main { display: grid } } }
      @layer lab { :root[data-theme='${ID}'] a { color: red } }
      @keyframes ${ID}-spin { to { rotate: 1turn } }
      @property --${ID}-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
      @font-face { font-family: '${ID}-serif'; src: url(./lab.woff2) format('woff2'); }
      :root[data-theme='${ID}'] [data-site-header] { background: url('./noise.svg') }
    `;
    expect(errors(css)).toEqual([]);
  });

  it.each([
    ['an unscoped selector', 'body { color: red }', 'seletor fora do escopo do tema: body'],
    ['one unscoped selector of a list', `:root[data-theme='${ID}'] a, a { color: red }`, 'seletor fora do escopo do tema: a'],
    ['another theme\'s scope', ":root[data-theme='lab-2099-w01'] a { color: red }", 'fora do escopo'],
    ['a longer id', `:root[data-theme='${ID}x'] a { color: red }`, 'fora do escopo'],
    ['the bare :root', ':root { --bg: #fff }', 'fora do escopo'],
    ['a scope that does not lead', `main :root[data-theme='${ID}'] { color: red }`, 'fora do escopo'],
    ['an unscoped rule inside @media', '@media print { body { color: red } }', 'fora do escopo'],
    ['a nested selector that widens the scope', `:root[data-theme='${ID}'] { :is(&, body) { display: none } }`, 'só pode usar & no início'],
    ['a nested selector with a second &', `:root[data-theme='${ID}'] { & + & { color: red } }`, 'só pode usar & no início'],
    ['a widening selector nested in @media', `:root[data-theme='${ID}'] { @media print { body:has(&) { display: none } } }`, 'só pode usar & no início'],
    ['an at-rule nested in a rule', `:root[data-theme='${ID}'] { @keyframes spin { to { rotate: 1turn } } }`, 'não é permitido dentro de uma regra'],
    ['an unprefixed @font-face family', "@font-face { font-family: Lab; src: url(./lab.woff2) }", '@font-face deve declarar font-family'],
    ['a @font-face without a family', '@font-face { src: url(./lab.woff2) }', '@font-face deve declarar font-family'],
    ['@import', "@import url('./x.css');", '@import não é permitido'],
    ['an unprefixed @keyframes', '@keyframes spin { to { rotate: 1turn } }', `@keyframes deve começar com "${ID}-"`],
    ['an unprefixed @property', "@property --bg { syntax: '<color>'; inherits: true; initial-value: red; }", '@property deve começar'],
    ['@scope', '@scope (main) { a { color: red } }', '@scope não é permitido'],
    ['an external URL', `:root[data-theme='${ID}'] body { background: url(https://example.com/x.png) }`, 'url() deve apontar'],
    ['a data: URL', `:root[data-theme='${ID}'] body { background: url("data:image/png;base64,AAAA") }`, 'url() deve apontar'],
    ['a root-relative URL', `:root[data-theme='${ID}'] body { background: url(/x.png) }`, 'url() deve apontar'],
    ['a protocol-relative URL', `@font-face { font-family: ${ID}-x; src: url(//cdn.example/x.woff2) }`, 'url() deve apontar'],
    ['broken CSS', `:root[data-theme='${ID}'] { color: red`, 'CSS inválido'],
  ])('rejects %s', (_, css, message) => {
    expect(errors(css)).toEqual(expect.arrayContaining([expect.stringContaining(message)]));
  });

  it('enforces the size budget', () => {
    const rule = `:root[data-theme='${ID}'] a { color: red }\n`;
    expect(errors(rule.repeat(Math.ceil(THEME_CSS_BUDGET / rule.length) + 1))).toEqual([
      expect.stringContaining('acima do orçamento'),
    ]);
  });
});
