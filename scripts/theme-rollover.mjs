// Week rollover of the visual laboratory (1C-03, docs/VISUAL_LAB.md):
//   npm run theme:rollover -- --week 2026-W43 --title "Nome do tema" [--summary "…"] [--dry-run]
// moves the slots (previous ← current, current ← lab-2026-w43, the theme leaving the slots → archived with the
// Git commit that last touched its folder), scaffolds themes/<id>/ when it does not exist yet, and validates the
// result like `prebuild` does; on any error the manifest and the scaffold are put back as they were.
// Themes dir: `themes`, or env LINKEDIA_THEMES_DIR.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { themeFiles, themesDir } from './themes.mjs';
import { validateThemes } from './validate-content.mjs';

/** Number of ISO weeks in `year` (52 or 53): the week of 28 December. */
export function isoWeeksInYear(year) {
  const dec28 = new Date(Date.UTC(year, 11, 28));
  const thursday = new Date(dec28);
  thursday.setUTCDate(dec28.getUTCDate() + 3 - ((dec28.getUTCDay() + 6) % 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday - jan1) / 86_400_000 + 1) / 7);
}

/** `2026-W43` → theme id `lab-2026-w43`; throws (pt-BR) on a malformed or nonexistent ISO week. */
export function labIdForWeek(week) {
  const match = /^(\d{4})-W(\d{2})$/.exec(week ?? '');
  if (!match) throw new Error(`semana inválida "${week}": use o formato ISO AAAA-Www (ex.: 2026-W43)`);
  const [year, number] = [Number(match[1]), Number(match[2])];
  if (number < 1 || number > isoWeeksInYear(year)) throw new Error(`a semana ${week} não existe em ${year}`);
  return `lab-${match[1]}-w${match[2]}`;
}

/**
 * The manifest after the rollover to `week` (pure; `manifest` is not changed).
 * @param {{ week: string, title: string, summary?: string, archivedRef?: string | null }} options
 *   archivedRef: Git commit recorded on the theme that leaves the slots.
 * @returns {{ manifest: object, id: string, archived: string | null }}
 */
export function rollover(manifest, { week, title, summary, archivedRef = null }) {
  const id = labIdForWeek(week);
  if (!title || title.trim().length < 2) throw new Error('--title é obrigatório (2 a 60 caracteres)');
  if (manifest.themes.some((t) => t.id === id || t.week_id === week)) {
    throw new Error(`já existe um tema para a semana ${week}: um por semana`);
  }
  if (manifest.week_id !== null && week <= manifest.week_id) {
    throw new Error(`a semana ${week} não é posterior à semana atual do manifesto (${manifest.week_id})`);
  }
  const archived = manifest.previous_theme_id; // null while current is null (validated)
  const themes = manifest.themes.map((t) =>
    t.id === archived ? { ...t, status: 'archived', git_ref: archivedRef ?? t.git_ref ?? null } : { ...t },
  );
  const entry = { id, kind: 'lab', week_id: week, title: title.trim(), status: 'active', git_ref: null };
  if (summary) entry.summary = summary.trim();
  themes.push(entry);
  return {
    id,
    archived,
    manifest: {
      ...manifest,
      previous_theme_id: manifest.current_theme_id,
      current_theme_id: id,
      week_id: week,
      themes,
    },
  };
}

/** Starting package: a scoped token block (renders like the baseline until edited) and the README outline. */
export function scaffold(id, week, title) {
  const css = `/* ${id} "${title}" (${week}). Every rule stays under :root[data-theme='${id}'] (docs/VISUAL_LAB.md);
   until this block is edited the theme renders like the baseline. List the contrast ratios here. */
:root[data-theme='${id}'] {
  /* --bg, --surface, --border, --fg, --muted, --accent, --accent-strong, --warning, --focus, --font-body, … */
}
`;
  const readme = `# ${id} — ${title}

Weekly experiment of the visual laboratory (ISO week ${week}).

## Concept

## Inspirations (consulted YYYY-MM-DD)

## Accessibility

## Performance

## Fallback

## Reuse

## Source
`;
  return { css, readme };
}

/** Commit that last touched `folder`; throws (pt-BR) when the folder has uncommitted changes or no commit. */
export function lastCommit(folder) {
  const git = (...args) => execFileSync('git', ['-C', folder, ...args], { encoding: 'utf8' }).trim();
  let dirty;
  let ref;
  try {
    dirty = git('status', '--porcelain', '--', '.');
    ref = git('log', '-1', '--format=%H', '--', '.');
  } catch {
    throw new Error(`${folder}: não foi possível ler o Git (a pasta precisa estar em um repositório)`);
  }
  if (dirty) throw new Error(`${folder}: há mudanças não commitadas; faça commit antes de arquivar o tema`);
  if (!ref) throw new Error(`${folder}: nenhum commit contém o tema; faça commit antes de arquivá-lo`);
  return ref;
}

/** Applies the rollover in `dir`; returns lines to print. Throws (pt-BR) with every problem found. */
export function run({ week, title, summary, dryRun = false }, dir = themesDir()) {
  const manifestPath = join(dir, 'manifest.json');
  const before = validateThemes(manifestPath);
  if (before.length) throw new Error(`o manifesto atual é inválido:\n  - ${before.join('\n  - ')}`);
  const original = readFileSync(manifestPath, 'utf8');
  const current = JSON.parse(original);
  const leaving = current.previous_theme_id;
  const archivedRef = leaving === null ? null : lastCommit(themeFiles(dir, leaving).folder);
  const { manifest, id, archived } = rollover(current, { week, title, summary, archivedRef });
  const files = themeFiles(dir, id);
  const created = !existsSync(files.folder);
  const lines = [
    `Atual: ${id} (${manifest.themes.at(-1).title})`,
    `Anterior: ${manifest.previous_theme_id ?? '(nenhum)'}`,
    `Arquivado: ${archived === null ? '(nenhum)' : `${archived} @ ${archivedRef}`}`,
    created ? `Pacote novo: ${files.folder} (theme.css + README.md)` : `Pacote existente: ${files.folder}`,
  ];
  if (dryRun) return ['(simulação, nada foi gravado)', ...lines];

  if (created) {
    const { css, readme } = scaffold(id, week, manifest.themes.at(-1).title);
    mkdirSync(files.folder, { recursive: true });
    writeFileSync(files.css, css);
    writeFileSync(files.readme, readme);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const after = validateThemes(manifestPath);
  if (after.length) {
    writeFileSync(manifestPath, original);
    if (created) rmSync(files.folder, { recursive: true, force: true });
    throw new Error(`rollover desfeito, o resultado seria inválido:\n  - ${after.join('\n  - ')}`);
  }
  return lines;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        week: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
    });
    const lines = run({ week: values.week, title: values.title, summary: values.summary, dryRun: values['dry-run'] });
    for (const line of lines) console.log(line);
  } catch (err) {
    console.error(`theme:rollover: ${err.message}`);
    process.exit(1);
  }
}
