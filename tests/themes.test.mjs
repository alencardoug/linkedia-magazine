// themes/manifest.json (D-025): the bootstrap manifest is valid and slot rules reject broken manifests.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateThemes } from '../scripts/validate-content.mjs';

const MANIFEST = resolve(import.meta.dirname, '../themes/manifest.json');
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
