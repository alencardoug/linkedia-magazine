#!/usr/bin/env node
// Validates exported content against contracts/ and cross-file references (D-029). Runs as `prebuild`.
// Articles and editions pick their schema by `schema_version` (V2-05): 1.0.0 → `*.schema.json` (v1, byte-identical
// to the engine's copy), 2.0.0 → `*.v2.schema.json`. An edition lists articles of its own version only.
//
// Layout of a content dir (default `content`, or `--dir <path>`, or env LINKEDIA_CONTENT_DIR):
//   articles/{article_id}.json · editions/{YYYY-MM-DD}.json · tags/catalog.json
// Missing folders mean "nothing exported yet"; the catalog is required once any article exists.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { BASELINE_ID, checkThemePackage, themesDir } from './themes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');

function compileValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const load = (name) => ajv.compile(JSON.parse(readFileSync(join(CONTRACTS_DIR, `${name}.schema.json`), 'utf8')));
  return {
    article: { '1.0.0': load('article'), '2.0.0': load('article.v2') },
    edition: { '1.0.0': load('edition'), '2.0.0': load('edition.v2') },
    catalog: load('tag_catalog'),
  };
}

const VERSIONS = ['1.0.0', '2.0.0'];
const time = (iso) => Date.parse(iso);

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

/**
 * @param {string} contentDir
 * @returns {{ errors: string[], counts: { articles: number, editions: number, tags: number } }}
 */
export function validateContent(contentDir) {
  const dir = resolve(contentDir);
  const validators = compileValidators();
  const errors = [];
  const rel = (path) => relative(dir, path) || basename(path);

  // Parse + schema-validate one file; returns the document only when it is valid. `validate` is one validator or a
  // map schema_version → validator.
  const check = (path, validators) => {
    let doc;
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      errors.push(`${rel(path)}: JSON inválido (${err.message})`);
      return null;
    }
    let validate = validators;
    if (typeof validators !== 'function') {
      validate = Object.hasOwn(validators, doc?.schema_version) ? validators[doc.schema_version] : undefined;
      if (!validate) {
        errors.push(`${rel(path)}: schema_version desconhecida (${JSON.stringify(doc?.schema_version)}; aceitas: ${VERSIONS.join(', ')})`);
        return null;
      }
    }
    if (!validate(doc)) {
      for (const e of validate.errors ?? []) errors.push(`${rel(path)}: ${e.instancePath || '(raiz)'} ${e.message}`);
      return null;
    }
    return doc;
  };

  const articles = new Map();
  const slugs = new Map();
  for (const path of jsonFiles(join(dir, 'articles'))) {
    const article = check(path, validators.article);
    if (!article) continue;
    const where = rel(path);
    if (basename(path) !== `${article.article_id}.json`) {
      errors.push(`${where}: o nome do arquivo deve ser ${article.article_id}.json`);
    }
    if (slugs.has(article.slug)) errors.push(`${where}: slug "${article.slug}" repetido (${slugs.get(article.slug)})`);
    slugs.set(article.slug, where);
    const sourceIds = new Set(article.sources.map((s) => s.source_id));
    if (sourceIds.size !== article.sources.length) errors.push(`${where}: source_id repetido em sources`);
    article.blocks.forEach((block, i) => {
      for (const id of block.source_ids ?? []) {
        if (!sourceIds.has(id)) errors.push(`${where}: /blocks/${i} cita a fonte inexistente "${id}"`);
      }
    });
    articles.set(article.article_id, { article, where });
  }

  let editions = 0;
  for (const path of jsonFiles(join(dir, 'editions'))) {
    const edition = check(path, validators.edition);
    if (!edition) continue;
    editions += 1;
    const where = rel(path);
    if (basename(path) !== `${edition.edition_date}.json`) {
      errors.push(`${where}: o nome do arquivo deve ser ${edition.edition_date}.json`);
    }
    const v2 = edition.schema_version === '2.0.0';
    if (v2 && time(edition.updated_at) < time(edition.published_at)) errors.push(`${where}: updated_at anterior a published_at`);
    for (const id of edition.article_ids) {
      const entry = articles.get(id);
      if (!entry) {
        errors.push(`${where}: matéria inexistente "${id}"`);
        continue;
      }
      const { article } = entry;
      if (article.schema_version !== edition.schema_version) {
        errors.push(`${where}: matéria "${id}" na versão ${article.schema_version}, edição na ${edition.schema_version}`);
        continue;
      }
      if (!v2) continue;
      if (article.edition_date !== edition.edition_date) errors.push(`${where}: matéria "${id}" com edition_date ${article.edition_date}`);
      const at = time(article.published_at);
      if (at < time(edition.published_at) || at > time(edition.updated_at)) {
        errors.push(`${where}: published_at da matéria "${id}" fora de [published_at, updated_at] da edição`);
      }
    }
  }

  let tags = 0;
  const catalogPath = join(dir, 'tags', 'catalog.json');
  if (existsSync(catalogPath)) {
    const catalog = check(catalogPath, validators.catalog);
    if (catalog) {
      tags = catalog.tags.length;
      const keys = new Set();
      for (const tag of catalog.tags) {
        if (keys.has(tag.key)) errors.push(`${rel(catalogPath)}: tag "${tag.key}" repetida`);
        if (tag.key.split(':')[0] !== tag.kind) errors.push(`${rel(catalogPath)}: tag "${tag.key}" com kind "${tag.kind}"`);
        keys.add(tag.key);
      }
      for (const { article, where } of articles.values()) {
        for (const key of article.tags) {
          if (!keys.has(key)) errors.push(`${where}: tag "${key}" ausente do catálogo`);
        }
      }
    }
  } else if (articles.size > 0) {
    errors.push(`${rel(catalogPath)}: catálogo de tags ausente`);
  }

  return { errors, counts: { articles: articles.size, editions, tags } };
}

/**
 * The magazine-owned theme manifest (D-025): schema, slot rules and the files of every slotted lab theme
 * (scripts/themes.mjs), so the switcher (1C-01) can trust it. Default: `<themes dir>/manifest.json`.
 * @param {string} [path]
 * @returns {string[]} errors (pt-BR)
 */
export function validateThemes(path = join(themesDir(), 'manifest.json')) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(CONTRACTS_DIR, 'theme_manifest.schema.json'), 'utf8')));
  const where = relative(ROOT, path) || basename(path);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return [`${where}: JSON inválido ou ausente (${err.message})`];
  }
  if (!validate(manifest)) return (validate.errors ?? []).map((e) => `${where}: ${e.instancePath || '(raiz)'} ${e.message}`);
  const errors = [];
  const byId = new Map(manifest.themes.map((t) => [t.id, t]));
  if (byId.size !== manifest.themes.length) errors.push(`${where}: id de tema repetido`);
  if (byId.get('minimal-dark')?.status !== 'active') errors.push(`${where}: minimal-dark ausente ou inativo`);
  for (const slot of ['current_theme_id', 'previous_theme_id']) {
    const id = manifest[slot];
    if (id !== null && byId.get(id)?.status !== 'active') errors.push(`${where}: ${slot} "${id}" não é um tema ativo`);
  }
  if (manifest.current_theme_id === null && manifest.previous_theme_id !== null) {
    errors.push(`${where}: previous_theme_id sem current_theme_id`);
  }
  if (manifest.current_theme_id !== null && manifest.current_theme_id === manifest.previous_theme_id) {
    errors.push(`${where}: previous_theme_id igual a current_theme_id`);
  }
  const slotted = new Set([manifest.current_theme_id, manifest.previous_theme_id]);
  for (const theme of manifest.themes) {
    if ((theme.kind === 'baseline') !== (theme.id === BASELINE_ID)) errors.push(`${where}: kind errado para ${theme.id}`);
    if (theme.kind === 'baseline' && theme.enhancement) errors.push(`${where}: o baseline não tem enhancement (só CSS)`);
    if (theme.kind === 'lab' && theme.status === 'active' && !slotted.has(theme.id)) {
      errors.push(`${where}: ${theme.id} está ativo mas não ocupa um slot`);
    }
  }
  if (errors.length) return errors;
  const dir = dirname(path);
  for (const theme of manifest.themes.filter((t) => slotted.has(t.id))) {
    errors.push(...checkThemePackage(dir, theme).map((e) => `${where}: ${e}`));
  }
  return errors;
}

function parseDir(argv) {
  const i = argv.indexOf('--dir');
  if (i !== -1) {
    if (!argv[i + 1]) throw new Error('--dir exige um caminho');
    return argv[i + 1];
  }
  return process.env.LINKEDIA_CONTENT_DIR || join(ROOT, 'content');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = parseDir(process.argv.slice(2));
  const { errors: contentErrors, counts } = validateContent(dir);
  const errors = [...contentErrors, ...validateThemes()];
  if (errors.length) {
    console.error(`Conteúdo inválido em ${dir}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `Conteúdo válido em ${dir}: ${counts.articles} matéria(s), ${counts.editions} edição(ões), ${counts.tags} tag(s).`,
  );
}
