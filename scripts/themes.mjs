// Theme packages and slots (D-025, docs/VISUAL_LAB.md), shared by the content validator, the Vite plugin in
// astro.config.mjs and the tests. Node only; the browser side is src/lib/theme-runtime.ts.
//
// A themes dir (default `themes`, or env LINKEDIA_THEMES_DIR for fixtures) holds `manifest.json` and one folder
// per lab theme: `theme.css` (every rule scoped under :root[data-theme="<id>"]), `README.md`, and `enhance.ts`
// only when the manifest declares an `enhancement`. The baseline always comes from this repository's
// `themes/minimal-dark`, whatever the themes dir.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const BASELINE_ID = 'minimal-dark';
export const BASELINE_CSS = join(ROOT, 'themes', BASELINE_ID, 'theme.css');
/** Performance budget for one lab theme's stylesheet (raw bytes); it ships on every page while slotted. */
export const THEME_CSS_BUDGET = 40_000;
/** What an enhancement may require of the device; the runtime checks each before importing the module. */
export const REQUIREMENTS = ['motion', 'webgl'];
const CONTAINER_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'starting-style']);

export function themesDir() {
  return resolve(process.env.LINKEDIA_THEMES_DIR || join(ROOT, 'themes'));
}

export function readManifest(dir = themesDir()) {
  return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
}

/**
 * The three switcher slots of a valid manifest. `previous`/`current` are null until experiments exist.
 * @returns {{ baseline: Slot, previous: Slot | null, current: Slot | null }}
 * @typedef {{ id: string, title: string, requires: string[] | null }} Slot
 */
export function slots(manifest) {
  const byId = new Map(manifest.themes.map((t) => [t.id, t]));
  const slot = (id) => {
    if (id === null) return null;
    const t = byId.get(id);
    return { id, title: t.title, requires: t.enhancement ? [...t.enhancement.requires] : null };
  };
  return {
    baseline: slot(manifest.baseline_theme_id),
    previous: slot(manifest.previous_theme_id),
    current: slot(manifest.current_theme_id),
  };
}

/** Lab themes in a slot, in switcher order (previous, current). */
export function slottedLabs(manifest) {
  const s = slots(manifest);
  return [s.previous, s.current].filter((t) => t !== null);
}

export function themeFiles(dir, id) {
  const folder = join(dir, id);
  return { folder, css: join(folder, 'theme.css'), readme: join(folder, 'README.md'), enhance: join(folder, 'enhance.ts') };
}

/**
 * Isolation of a lab stylesheet: every top-level rule (also inside @media/@supports/…) must start with the
 * theme's own `:root[data-theme="<id>"]`; a nested rule may use `&` only as its first character (without `&` it
 * is implicitly `& …`), so `:is(&, body)` cannot widen the scope; global names (@keyframes, @property,
 * @font-face families) carry the id, and nothing is fetched (@import, external or data: URLs).
 * @returns {string[]} errors (pt-BR)
 */
export function checkThemeCss(id, css, where = `${id}/theme.css`) {
  const errors = [];
  if (Buffer.byteLength(css) > THEME_CSS_BUDGET) {
    errors.push(`${where}: ${Buffer.byteLength(css)} bytes, acima do orçamento de ${THEME_CSS_BUDGET}`);
  }
  let root;
  try {
    root = postcss.parse(css, { from: undefined });
  } catch (err) {
    return [...errors, `${where}: CSS inválido (${err.reason ?? err.message})`];
  }
  const scope = new RegExp(`^:root\\[data-theme=(["'])${id}\\1\\]`);
  const line = (node) => `${where}:${node.source?.start?.line ?? '?'}`;
  const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, '$2');
  const walk = (container, nested) =>
    container.each((node) => {
      if (node.type === 'rule') {
        for (const raw of node.selectors) {
          const selector = raw.trim();
          if (!nested && !scope.test(selector)) errors.push(`${line(node)}: seletor fora do escopo do tema: ${selector}`);
          if (nested && selector.slice(1).includes('&')) {
            errors.push(`${line(node)}: seletor aninhado só pode usar & no início: ${selector}`);
          }
        }
        walk(node, true);
      } else if (node.type === 'atrule') {
        const name = node.name.toLowerCase();
        if (CONTAINER_AT_RULES.has(name)) {
          if (node.nodes) walk(node, nested);
        } else if (nested) {
          errors.push(`${line(node)}: @${node.name} não é permitido dentro de uma regra`);
        } else if (name === 'keyframes') {
          if (!node.params.trim().startsWith(`${id}-`)) errors.push(`${line(node)}: @keyframes deve começar com "${id}-"`);
        } else if (name === 'property') {
          if (!node.params.trim().startsWith(`--${id}-`)) errors.push(`${line(node)}: @property deve começar com "--${id}-"`);
        } else if (name === 'font-face') {
          const families = node.nodes?.filter((d) => d.type === 'decl' && d.prop.toLowerCase() === 'font-family') ?? [];
          if (families.length === 0 || families.some((d) => !unquote(d.value).startsWith(`${id}-`))) {
            errors.push(`${line(node)}: @font-face deve declarar font-family começando com "${id}-"`);
          }
        } else {
          errors.push(`${line(node)}: @${node.name} não é permitido em um tema`);
        }
      }
    });
  walk(root, false);
  root.walkDecls((decl) => {
    for (const [, raw] of decl.value.matchAll(/url\(\s*([^)]*?)\s*\)/gi)) {
      const target = raw.replace(/^['"]|['"]$/g, '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) {
        errors.push(`${line(decl)}: url() deve apontar para um arquivo da pasta do tema: ${target}`);
      }
    }
  });
  return errors;
}

/**
 * Files of one slotted lab theme: theme.css (scoped, within budget), README.md, and enhance.ts exactly when the
 * manifest declares an enhancement.
 * @returns {string[]} errors (pt-BR)
 */
export function checkThemePackage(dir, theme) {
  const files = themeFiles(dir, theme.id);
  const errors = [];
  if (!existsSync(files.css) || !statSync(files.css).isFile()) return [`${theme.id}: theme.css ausente`];
  errors.push(...checkThemeCss(theme.id, readFileSync(files.css, 'utf8')));
  if (!existsSync(files.readme)) errors.push(`${theme.id}: README.md ausente`);
  const hasModule = existsSync(files.enhance);
  if (theme.enhancement && !hasModule) errors.push(`${theme.id}: enhancement declarado sem enhance.ts`);
  if (!theme.enhancement && hasModule) errors.push(`${theme.id}: enhance.ts existe mas o manifesto não declara enhancement`);
  return errors;
}
