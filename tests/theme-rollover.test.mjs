// Week rollover (1C-03; fixed previous slot since 2026-10-19): slot rotation, one theme per ISO week, archived Git ref, scaffold, and the CLI on a
// Git-tracked copy of the fixture themes (it validates the result and undoes an invalid one).
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isoWeeksInYear, labIdForWeek, rollover, scaffold } from '../scripts/theme-rollover.mjs';
import { checkThemeCss } from '../scripts/themes.mjs';

const SCRIPT = resolve(import.meta.dirname, '../scripts/theme-rollover.mjs');
const FIXTURES = resolve(import.meta.dirname, 'fixtures/themes');
const fixture = () => JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'linkedia-rollover-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('ISO weeks', () => {
  it('knows 52- and 53-week years and maps a week to its theme id', () => {
    expect([2020, 2026, 2032].map(isoWeeksInYear)).toEqual([53, 53, 53]);
    expect([2021, 2025, 2027].map(isoWeeksInYear)).toEqual([52, 52, 52]);
    expect(labIdForWeek('2026-W43')).toBe('lab-2026-w43');
    expect(labIdForWeek('2026-W53')).toBe('lab-2026-w53');
  });

  it('rejects malformed and nonexistent weeks', () => {
    for (const week of [undefined, '2026-43', '2026-w43', '2026-W4', '2026-W00']) {
      expect(() => labIdForWeek(week), String(week)).toThrow(/semana/);
    }
    expect(() => labIdForWeek('2027-W53')).toThrow('a semana 2027-W53 não existe em 2027');
  });
});

describe('rollover', () => {
  it('keeps the fixed previous theme, archives the old current with its ref, and adds the new current', () => {
    const before = fixture();
    const { manifest, id, archived } = rollover(before, { week: '2099-W03', title: ' Nova ', archivedRef: 'abc123' });
    expect(id).toBe('lab-2099-w03');
    expect(archived).toBe('lab-2099-w02');
    expect(manifest).toMatchObject({ previous_theme_id: 'lab-2099-w01', current_theme_id: id, week_id: '2099-W03' });
    expect(manifest.themes.find((t) => t.id === 'lab-2099-w02')).toMatchObject({ status: 'archived', git_ref: 'abc123' });
    expect(manifest.themes.find((t) => t.id === 'lab-2099-w01')).toMatchObject({ status: 'active' });
    const next = rollover(manifest, { week: '2099-W04', title: 'Outra', archivedRef: 'def456' });
    expect(next.archived).toBe('lab-2099-w03'); // week after week, only the current rotates
    expect(next.manifest).toMatchObject({ previous_theme_id: 'lab-2099-w01', current_theme_id: 'lab-2099-w04' });
    expect(manifest.themes.at(-1)).toEqual({
      id, kind: 'lab', week_id: '2099-W03', title: 'Nova', status: 'active', git_ref: null,
    });
    expect(before).toEqual(fixture()); // input untouched
  });

  it('archives nothing from the bootstrap state or with a single experiment', () => {
    const bootstrap = { ...fixture(), previous_theme_id: null, current_theme_id: null, week_id: null };
    bootstrap.themes = bootstrap.themes.filter((t) => t.kind === 'baseline');
    const first = rollover(bootstrap, { week: '2099-W01', title: 'Um', summary: 'Primeiro.' });
    expect(first.archived).toBeNull();
    expect(first.manifest).toMatchObject({ previous_theme_id: null, current_theme_id: 'lab-2099-w01' });
    expect(first.manifest.themes.at(-1).summary).toBe('Primeiro.');
    const second = rollover(first.manifest, { week: '2099-W02', title: 'Dois' });
    expect(second.archived).toBeNull();
    expect(second.manifest).toMatchObject({ previous_theme_id: 'lab-2099-w01', current_theme_id: 'lab-2099-w02' });
  });

  it('refuses a second theme for a week, a week not after the current one, and a missing title', () => {
    expect(() => rollover(fixture(), { week: '2099-W02', title: 'Outro' })).toThrow('já existe um tema para a semana 2099-W02');
    expect(() => rollover(fixture(), { week: '2098-W40', title: 'Velho' })).toThrow('não é posterior');
    expect(() => rollover(fixture(), { week: '2099-W03' })).toThrow('--title é obrigatório');
  });

  it('scaffolds a package that passes the isolation check', () => {
    const { css, readme } = scaffold('lab-2099-w03', '2099-W03', 'Nova');
    expect(checkThemeCss('lab-2099-w03', css)).toEqual([]);
    expect(readme).toMatch(/^# lab-2099-w03 — Nova\n/);
    expect(readme).toContain('## Accessibility');
  });
});

describe('npm run theme:rollover', () => {
  // A Git repository holding a copy of the fixture themes, all committed: one commit per theme folder (so a ref
  // lookup on the wrong folder shows), then an unrelated commit on top (so HEAD is never the right answer).
  function repo() {
    const dir = mkdtempSync(join(tmp, 'repo-'));
    cpSync(FIXTURES, dir, { recursive: true });
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
    const commit = (message) => git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message);
    git('init', '-q', '-b', 'main');
    const refs = {};
    for (const id of ['lab-2099-w01', 'lab-2099-w02']) {
      git('add', id);
      commit(id);
      refs[id] = git('rev-parse', 'HEAD');
    }
    git('add', '.');
    commit('rest');
    return { dir, refs, head: git('rev-parse', 'HEAD') };
  }
  const cli = (dir, ...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, LINKEDIA_THEMES_DIR: dir } });
  const manifest = (dir) => JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

  it('writes a valid rollover with a scaffold and the archived theme ref', () => {
    const { dir, refs, head } = repo();
    // Uncommitted work on the fixed theme does not block the rollover: only the archived theme must be committed.
    writeFileSync(join(dir, 'lab-2099-w01', 'README.md'), '\nnota local\n', { flag: 'a' });
    const result = cli(dir, '--week', '2099-W03', '--title', 'Nova');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(refs['lab-2099-w02']).not.toBe(head);
    expect(result.stdout).toContain(`Arquivado: lab-2099-w02 @ ${refs['lab-2099-w02']}`);
    expect(result.stdout).toContain('Fixo: lab-2099-w01');
    expect(manifest(dir)).toMatchObject({ previous_theme_id: 'lab-2099-w01', current_theme_id: 'lab-2099-w03' });
    expect(manifest(dir).themes.find((t) => t.id === 'lab-2099-w02').git_ref).toBe(refs['lab-2099-w02']);
    expect(manifest(dir).themes.find((t) => t.id === 'lab-2099-w01')).toMatchObject({ status: 'active', git_ref: null });
    expect(existsSync(join(dir, 'lab-2099-w03', 'theme.css'))).toBe(true);
    expect(existsSync(join(dir, 'lab-2099-w03', 'README.md'))).toBe(true);
  });

  it('writes nothing on --dry-run', () => {
    const { dir } = repo();
    const before = readFileSync(join(dir, 'manifest.json'), 'utf8');
    const result = cli(dir, '--week', '2099-W03', '--title', 'Nova', '--dry-run');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('simulação');
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'lab-2099-w03'))).toBe(false);
  });

  it('undoes the manifest and removes its new scaffold when the result is invalid', () => {
    const { dir } = repo();
    const before = readFileSync(join(dir, 'manifest.json'), 'utf8');
    const result = cli(dir, '--week', '2099-W03', '--title', 'x'.repeat(61)); // the schema allows 60 characters
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rollover desfeito');
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'lab-2099-w03'))).toBe(false);
  });

  it('keeps an existing package, and undoes everything when it is invalid', () => {
    const { dir } = repo();
    const before = readFileSync(join(dir, 'manifest.json'), 'utf8');
    cpSync(join(dir, 'lab-2099-w01'), join(dir, 'lab-2099-w03'), { recursive: true }); // CSS scoped to w01
    const result = cli(dir, '--week', '2099-W03', '--title', 'Nova');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rollover desfeito');
    expect(result.stderr).toContain('seletor fora do escopo do tema');
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'lab-2099-w03'))).toBe(true); // not ours to delete
  });

  it('refuses to archive a theme with uncommitted changes, and an invalid current manifest', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'lab-2099-w02', 'theme.css'), '/* edited */', { flag: 'a' });
    const dirty = cli(dir, '--week', '2099-W03', '--title', 'Nova');
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain('mudanças não commitadas');
    const broken = repo().dir;
    writeFileSync(join(broken, 'manifest.json'), '{}');
    const invalid = cli(broken, '--week', '2099-W03', '--title', 'Nova');
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('o manifesto atual é inválido');
  });
});
