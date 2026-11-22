#!/usr/bin/env node
// One content dir for the single e2e build (V2-06): the example content (content/examples, v1) plus the v2 fixture
// (tests/fixtures/content-v2, V2-05), so the site suites and the v2 fast-path smoke run on the same dist.
// Articles and editions are copied side by side (a clash fails); the two tag catalogs are merged by key.
// Writes node_modules/.cache/linkedia-e2e-content (or the dir given as the first argument) and prints its path.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const E2E_SOURCES = [join(ROOT, 'content/examples'), join(ROOT, 'tests/fixtures/content-v2')];
export const E2E_CONTENT_DIR = join(ROOT, 'node_modules/.cache/linkedia-e2e-content');

export function buildE2eContent(out = E2E_CONTENT_DIR, sources = E2E_SOURCES) {
  rmSync(out, { recursive: true, force: true });
  const tags = new Map();
  let schemaVersion;
  for (const source of sources) {
    for (const kind of ['articles', 'editions']) {
      const dir = join(source, kind);
      if (!existsSync(dir)) continue;
      mkdirSync(join(out, kind), { recursive: true });
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        if (existsSync(join(out, kind, file))) throw new Error(`${kind}/${file} existe em mais de uma fonte`);
        cpSync(join(dir, file), join(out, kind, file));
      }
    }
    const catalog = JSON.parse(readFileSync(join(source, 'tags/catalog.json'), 'utf8'));
    schemaVersion ??= catalog.schema_version;
    if (catalog.schema_version !== schemaVersion) throw new Error('catálogos de tags com schema_version diferentes');
    for (const tag of catalog.tags) {
      if (tags.has(tag.key) && JSON.stringify(tags.get(tag.key)) !== JSON.stringify(tag)) {
        throw new Error(`tag ${tag.key} difere entre as fontes`);
      }
      tags.set(tag.key, tag);
    }
  }
  mkdirSync(join(out, 'tags'), { recursive: true });
  const sorted = [...tags.values()].sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(join(out, 'tags/catalog.json'), `${JSON.stringify({ schema_version: schemaVersion, tags: sorted }, null, 2)}\n`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(buildE2eContent(process.argv[2] ? resolve(process.argv[2]) : undefined));
}
