// Classifies a CI run as `content` (only exported edition content changed: the fast path) or `full` (anything
// else: the whole suite). V2-01. Anything the script cannot prove is content-only runs `full`: an unknown event,
// a first push, a force push (the old head is not an ancestor), a missing commit, an empty diff, a deletion, a
// rename (diffed with --no-renames, so a rename is a deletion plus an addition), a mode-only change, or any path
// outside the three exported content locations. `content/examples/` holds test fixtures, so it is not content.
// A content run also lists the unchanged articles whose pages the change alters (`affectedArticles`): every
// article an added or modified edition lists (before or after), and every article tagged with a catalog entry
// that was added, removed or edited. If those cannot be resolved, the run is `full`.
//
// CLI (GitHub Actions): `node scripts/ci/classify-changes.mjs` reads GITHUB_EVENT_NAME, GITHUB_EVENT_PATH and
// GITHUB_SHA, needs the full history (checkout fetch-depth 0), and appends `mode` and `files` (the changed content
// paths plus the affected article paths, one per line: what the fast-path smoke checks) to GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const CONTENT_PATH =
  /^content\/(articles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json|editions\/\d{4}-\d{2}-\d{2}\.json|tags\/catalog\.json)$/;
const ZERO = /^0+$/;

/** Entries of `git diff --raw -z --no-renames`: `{ status, path, oldMode, newMode }`. */
export function parseRawDiff(output) {
  const parts = output.split('\0');
  const entries = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i];
    if (!meta.startsWith(':')) throw new Error(`unexpected diff record: ${JSON.stringify(meta)}`);
    const [oldMode, newMode, , , status] = meta.slice(1).split(' ');
    entries.push({ status, path: parts[i + 1], oldMode, newMode });
  }
  return entries;
}

/** `{ mode, files, reason }` for a list of diff entries. */
export function classifyEntries(entries) {
  if (entries.length === 0) return { mode: 'full', files: [], reason: 'empty diff' };
  for (const e of entries) {
    if (!CONTENT_PATH.test(e.path)) return { mode: 'full', files: [], reason: `non-content path ${e.path}` };
    if (e.status !== 'A' && e.status !== 'M') return { mode: 'full', files: [], reason: `status ${e.status} on ${e.path}` };
    if (e.newMode !== '100644' || (e.status === 'M' && e.oldMode !== '100644'))
      return { mode: 'full', files: [], reason: `file mode change on ${e.path}` };
  }
  return { mode: 'content', files: entries.map((e) => e.path).sort(), reason: 'content only' };
}

/** The commit to diff against, or `{ full: reason }`. `git(args)` returns stdout or throws. */
export function diffBase({ event, payload, sha, git }) {
  if (event === 'pull_request') {
    const base = payload?.pull_request?.base?.sha;
    return base ? { base } : { full: 'pull request without a base' };
  }
  if (event === 'push') {
    const before = payload?.before;
    if (!before || ZERO.test(before)) return { full: 'first push of the ref' };
    if (payload?.forced) return { full: 'force push' };
    try {
      git(['cat-file', '-e', `${before}^{commit}`]);
      git(['merge-base', '--is-ancestor', before, sha]);
    } catch {
      return { full: 'previous head missing or not an ancestor' };
    }
    return { base: before };
  }
  return { full: `event ${event}` };
}

const ARTICLE_PATH = (id) => `content/articles/${id}.json`;

/** Sorted paths of unchanged articles whose rendered pages change with `entries` (content-only diff entries). */
export function affectedArticles({ entries, base, head, git }) {
  const json = (rev, path) => JSON.parse(git(['show', `${rev}:${path}`]));
  const headArticles = git(['ls-tree', '-r', '--name-only', head, 'content/articles/'])
    .split('\n')
    .filter((p) => CONTENT_PATH.test(p));
  const exists = new Set(headArticles);
  const affected = new Set();
  for (const e of entries) {
    if (!e.path.startsWith('content/editions/')) continue;
    const ids = [...json(head, e.path).article_ids, ...(e.status === 'M' ? json(base, e.path).article_ids : [])];
    for (const id of ids) if (exists.has(ARTICLE_PATH(id))) affected.add(ARTICLE_PATH(id));
  }
  const catalog = entries.find((e) => e.path === 'content/tags/catalog.json');
  if (catalog) {
    const byKey = (doc) => new Map(doc.tags.map((t) => [t.key, JSON.stringify(t)]));
    const now = byKey(json(head, catalog.path));
    const then = catalog.status === 'M' ? byKey(json(base, catalog.path)) : new Map();
    const changed = new Set([...now.keys(), ...then.keys()].filter((k) => now.get(k) !== then.get(k)));
    if (changed.size > 0)
      for (const path of headArticles) if (json(head, path).tags.some((t) => changed.has(t))) affected.add(path);
  }
  for (const e of entries) affected.delete(e.path);
  return [...affected].sort();
}

export function classify({ event, payload, sha, git }) {
  const range = diffBase({ event, payload, sha, git });
  if (range.full) return { mode: 'full', files: [], reason: range.full };
  // PRs check out the merge commit, so HEAD is the tree being tested; on push HEAD is `sha`.
  const head = event === 'pull_request' ? 'HEAD' : sha;
  const raw = git(['diff', '--raw', '-z', '--no-renames', '--no-abbrev', range.base, head]);
  const entries = parseRawDiff(raw);
  const result = classifyEntries(entries);
  if (result.mode !== 'content') return result;
  try {
    return { ...result, affected: affectedArticles({ entries, base: range.base, head, git }) };
  } catch (err) {
    return { mode: 'full', files: [], reason: `affected pages unresolved: ${err.message.split('\n')[0]}` };
  }
}

function main() {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const env = process.env;
  const payload = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
  let result;
  try {
    result = classify({ event: env.GITHUB_EVENT_NAME, payload, sha: env.GITHUB_SHA, git });
  } catch (err) {
    result = { mode: 'full', files: [], reason: `classification error: ${err.message}` };
  }
  console.log(`mode=${result.mode} (${result.reason})`);
  for (const f of result.files) console.log(`  ${f}`);
  for (const f of result.affected ?? []) console.log(`  ${f} (affected)`);
  const smoke = [...result.files, ...(result.affected ?? [])];
  if (env.GITHUB_OUTPUT) {
    const eof = `EOF_${randomUUID()}`;
    appendFileSync(env.GITHUB_OUTPUT, `mode=${result.mode}\nfiles<<${eof}\n${smoke.join('\n')}\n${eof}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
