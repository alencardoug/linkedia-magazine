// The single e2e build's content (V2-06, scripts/ci/e2e-content.mjs): examples + v2 fixture in one valid dir.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildE2eContent, E2E_SOURCES } from '../scripts/ci/e2e-content.mjs';
import { validateContent } from '../scripts/validate-content.mjs';

const temps = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'linkedia-e2e-content-'));
  temps.push(dir);
  return dir;
};
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('e2e content', () => {
  it('merges the examples and the v2 fixture into one valid content dir', () => {
    const out = buildE2eContent(join(temp(), 'content'));
    const count = (src, kind) => readdirSync(join(src, kind)).length;
    expect(readdirSync(join(out, 'articles')).length).toBe(E2E_SOURCES.reduce((n, s) => n + count(s, 'articles'), 0));
    expect(readdirSync(join(out, 'editions')).length).toBe(E2E_SOURCES.reduce((n, s) => n + count(s, 'editions'), 0));
    const keys = JSON.parse(readFileSync(join(out, 'tags/catalog.json'), 'utf8')).tags.map((t) => t.key);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(validateContent(out).errors).toEqual([]);
  });

  it('refuses a file present in two sources and a tag that differs between them', () => {
    const [a, b] = [temp(), temp()];
    cpSync(E2E_SOURCES[0], a, { recursive: true });
    cpSync(E2E_SOURCES[0], b, { recursive: true });
    expect(() => buildE2eContent(join(temp(), 'x'), [a, b])).toThrow(/existe em mais de uma fonte/);
    rmSync(join(b, 'articles'), { recursive: true });
    rmSync(join(b, 'editions'), { recursive: true });
    const catalog = JSON.parse(readFileSync(join(b, 'tags/catalog.json'), 'utf8'));
    catalog.tags[0].label = 'Outro rótulo';
    writeFileSync(join(b, 'tags/catalog.json'), JSON.stringify(catalog));
    expect(() => buildE2eContent(join(temp(), 'y'), [a, b])).toThrow(/difere entre as fontes/);
  });
});
