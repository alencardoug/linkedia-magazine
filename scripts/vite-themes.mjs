// Vite plugin (astro.config.mjs): the slotted themes of the manifest as virtual modules, so a build ships the
// stylesheets and enhancement modules of the baseline, previous and current themes only (VISUAL_LAB).
//   virtual:linkedia-themes/slots         default export: { baseline, previous, current } (scripts/themes.mjs `slots`)
//   virtual:linkedia-themes/styles        side effects: imports each slotted lab's theme.css (after the baseline)
//   virtual:linkedia-themes/enhancements  default export: { [id]: { requires, load: () => import(enhance.ts) } }
// The manifest is validated first; an invalid one fails the build.

import { readManifest, slots, slottedLabs, themeFiles, themesDir } from './themes.mjs';
import { validateThemes } from './validate-content.mjs';

const PREFIX = 'virtual:linkedia-themes/';
const MODULES = new Set(['slots', 'styles', 'enhancements']);

function source(name, dir) {
  const errors = validateThemes(`${dir}/manifest.json`);
  if (errors.length) throw new Error(`Manifesto de temas inválido:\n  - ${errors.join('\n  - ')}`);
  const manifest = readManifest(dir);
  const labs = slottedLabs(manifest);
  if (name === 'slots') return `export default ${JSON.stringify(slots(manifest))};`;
  if (name === 'styles') return labs.map((t) => `import ${JSON.stringify(themeFiles(dir, t.id).css)};`).join('\n');
  const entries = labs
    .filter((t) => t.requires !== null)
    .map((t) => `${JSON.stringify(t.id)}: { requires: ${JSON.stringify(t.requires)}, load: () => import(${JSON.stringify(themeFiles(dir, t.id).enhance)}) }`);
  return `export default {${entries.join(', ')}};`;
}

export function linkediaThemes() {
  return {
    name: 'linkedia-themes',
    resolveId(id) {
      if (id.startsWith(PREFIX) && MODULES.has(id.slice(PREFIX.length))) return `\0${id}`;
    },
    load(id) {
      if (!id.startsWith(`\0${PREFIX}`)) return;
      const dir = themesDir();
      this.addWatchFile(`${dir}/manifest.json`);
      return source(id.slice(PREFIX.length + 1), dir);
    },
  };
}
