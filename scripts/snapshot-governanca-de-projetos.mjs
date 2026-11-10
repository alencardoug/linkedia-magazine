// Special "Governança de Projetos" (owner, 2026-11-10): a standalone interactive guide built in its own project and
// checked in here as a static snapshot under `public/`, so CI builds it from a fresh checkout without that project.
//
//   node scripts/snapshot-governanca-de-projetos.mjs <guide>/dist/especiais/governanca-de-projetos
//
// The guide is built for a directory URL (`…/governanca-de-projetos/`, relative links). Linkedia serves clean URLs
// without a trailing slash, where `./x` would resolve under `/especiais/`. So the snapshot:
//   - writes the interactive page to `public/especiais/governanca-de-projetos.html` (served at the slashless route)
//     and the reading page, JSON and assets under `public/especiais/governanca-de-projetos/`;
//   - rewrites every relative link of both pages and of the modules to origin-relative URLs under that route;
//   - recomputes the asset directory hash over the rewritten bytes (same scheme as the guide's build), so a changed
//     module never reuses a cached directory name; relative imports between modules stay as they are.
// Running it again with the same input yields the same files.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const SLUG = 'governanca-de-projetos';
export const ROUTE = `/especiais/${SLUG}`;
export const CANONICAL = `https://linkedia.web.app${ROUTE}`;
const READING = `${ROUTE}/guia-completo`;
const JSON_URL = `${ROUTE}/conteudo.json`;

function files(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(dir, join(prefix, e.name)) : [join(prefix, e.name)]))
    .map((p) => p.split(sep).join('/'));
}

// Replace every occurrence and fail when an expected reference is missing, so a change in the guide's markup
// cannot silently leave a relative link behind.
function swap(text, from, to, where, min = 1) {
  const count = text.split(from).length - 1;
  if (count < min) throw new Error(`${where}: esperado ${from} (${min}x), encontrado ${count}x`);
  return text.replaceAll(from, to);
}

/** The asset directory name: sha256 over the sorted `name\0bytes\0` pairs, first 16 hex digits. */
export function assetHash(assets) {
  const hash = createHash('sha256');
  for (const name of [...assets.keys()].sort()) hash.update(name + '\0').update(assets.get(name)).update('\0');
  return hash.digest('hex').slice(0, 16);
}

/** The files of `dir` (recursive), as posix paths relative to it. */
export { files };

export function snapshot(source) {
  const top = readdirSync(source).sort();
  const expected = ['assets', 'conteudo.json', 'guia-completo.html', 'index.html'];
  if (JSON.stringify(top) !== JSON.stringify(expected)) {
    throw new Error(`Origem inesperada em ${source}: ${top.join(', ')} (esperado: ${expected.join(', ')})`);
  }
  const hashes = readdirSync(join(source, 'assets'));
  if (hashes.length !== 1 || !/^[0-9a-f]{16}$/.test(hashes[0])) throw new Error(`Uma pasta assets/<hash> esperada: ${hashes}`);
  const oldDir = `./assets/${hashes[0]}/`;
  const assetRoot = join(source, 'assets', hashes[0]);

  const assets = new Map();
  for (const name of files(assetRoot)) {
    if (!/\.(mjs|js|css)$/.test(name)) throw new Error(`Arquivo de asset não previsto: ${name}`);
    let bytes = readFileSync(join(assetRoot, name));
    if (/\.m?js$/.test(name)) {
      let code = bytes.toString('utf8');
      code = code.replaceAll('href="./guia-completo.html"', `href="${READING}"`).replaceAll('href="./conteudo.json"', `href="${JSON_URL}"`);
      if (/["'`]\.\/(?:guia-completo|conteudo|index)\b/.test(code)) throw new Error(`${name}: link relativo restante`);
      bytes = Buffer.from(code);
    }
    assets.set(name, bytes);
  }
  const libraryLinks = ['views/biblioteca.mjs', 'views/metodo.mjs'].map((n) => assets.get(n)?.toString('utf8') ?? '');
  if (!libraryLinks.every((code) => code.includes(`href="${READING}"`))) throw new Error('Links da biblioteca/método não reescritos');

  const newDir = `${ROUTE}/assets/${assetHash(assets)}/`;

  let index = readFileSync(join(source, 'index.html'), 'utf8');
  if (index.includes('name="robots"')) throw new Error('index.html com noindex: use a saída de dist/especiais, não a prévia da raiz');
  index = swap(index, oldDir, newDir, 'index.html', 4);
  index = swap(index, 'href="./guia-completo.html"', `href="${READING}"`, 'index.html');
  index = swap(index, `href="${CANONICAL}/"`, `href="${CANONICAL}"`, 'index.html (canonical)');
  index = swap(index, `content="${CANONICAL}/"`, `content="${CANONICAL}"`, 'index.html (og:url)');

  let reading = readFileSync(join(source, 'guia-completo.html'), 'utf8');
  reading = swap(reading, oldDir, newDir, 'guia-completo.html', 3);
  reading = swap(reading, 'href="./index.html"', `href="${ROUTE}"`, 'guia-completo.html', 2);

  for (const [name, page] of [['index.html', index], ['guia-completo.html', reading]]) {
    const relativeRefs = [...page.matchAll(/\s(?:href|src)="(\.[^"]*)"/g)].map((m) => m[1]);
    if (relativeRefs.length) throw new Error(`${name}: referências relativas restantes: ${relativeRefs.join(', ')}`);
  }
  const json = readFileSync(join(source, 'conteudo.json'));
  JSON.parse(json.toString('utf8'));
  return { index, reading, json, assets, assetDir: newDir };
}

export function write(source, publicDir) {
  const { index, reading, json, assets, assetDir } = snapshot(source);
  const base = join(publicDir, 'especiais');
  const dir = join(base, SLUG);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(base, `${SLUG}.html`), index);
  writeFileSync(join(dir, 'guia-completo.html'), reading);
  writeFileSync(join(dir, 'conteudo.json'), json);
  for (const [name, bytes] of assets) {
    const target = join(publicDir, assetDir.slice(1), name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return assetDir;
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  const source = process.argv[2];
  if (!source || !existsSync(source)) {
    console.error('Uso: node scripts/snapshot-governanca-de-projetos.mjs <guia>/dist/especiais/governanca-de-projetos');
    process.exit(2);
  }
  const publicDir = resolve(import.meta.dirname, '..', 'public');
  const assetDir = write(resolve(source), publicDir);
  console.log(`Snapshot em ${relative(process.cwd(), publicDir)}/especiais: ${ROUTE}, assets ${assetDir}`);
}
