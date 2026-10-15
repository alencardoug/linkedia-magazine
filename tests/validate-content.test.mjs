import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/validate-content.mjs';

const EXAMPLES = resolve(import.meta.dirname, '../content/examples');
const SCRIPT = resolve(import.meta.dirname, '../scripts/validate-content.mjs');
const ARTICLE = 'articles/11111111-1111-4111-8111-111111111111.json';
const EDITION = 'editions/2026-10-14.json';

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Copy of the examples with `mutate(doc)` applied to one file.
function corrupted(file, mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'linkedia-content-'));
  temps.push(dir);
  cpSync(EXAMPLES, dir, { recursive: true });
  const path = join(dir, file);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  mutate(doc);
  writeFileSync(path, JSON.stringify(doc));
  return dir;
}

describe('validate-content', () => {
  it('accepts content/examples', () => {
    const { errors, counts } = validateContent(EXAMPLES);
    expect(errors).toEqual([]);
    expect(counts).toEqual({ articles: 1, editions: 1, tags: 2 });
  });

  it('accepts an empty content dir (nothing exported yet)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'linkedia-empty-'));
    temps.push(dir);
    expect(validateContent(dir).errors).toEqual([]);
  });

  it.each([
    ['schema: missing title', ARTICLE, (a) => delete a.title, '(raiz) must have required property \'title\''],
    ['schema: bad edition date', EDITION, (e) => (e.edition_date = '2026-13-40'), '/edition_date must match format'],
    ['edition cites an unknown article', EDITION, (e) => e.article_ids.push('22222222-2222-4222-8222-222222222222'), 'matéria inexistente'],
    ['block cites an unknown source', ARTICLE, (a) => (a.blocks[0].source_ids = ['s9']), 'fonte inexistente "s9"'],
    ['tag missing from the catalog', ARTICLE, (a) => a.tags.push('topic:unlisted'), 'ausente do catálogo'],
  ])('rejects %s', (_label, file, mutate, message) => {
    const { errors } = validateContent(corrupted(file, mutate));
    expect(errors.join('\n')).toContain(message);
  });

  it('CLI exits non-zero on a corrupted copy and zero on the examples', () => {
    expect(execFileSync('node', [SCRIPT, '--dir', EXAMPLES], { encoding: 'utf8' })).toContain('Conteúdo válido');
    const bad = corrupted(ARTICLE, (a) => (a.blocks[0].source_ids = ['s9']));
    expect(() => execFileSync('node', [SCRIPT, '--dir', bad], { stdio: 'pipe' })).toThrow();
  });
});
