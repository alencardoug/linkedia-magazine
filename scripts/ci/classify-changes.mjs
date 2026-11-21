// Classifies a CI run as `content` (only exported edition content changed: the fast path) or `full` (anything
// else: the whole suite). V2-01. Anything the script cannot prove is content-only runs `full`: an unknown event,
// a first push, a force push (the old head is not an ancestor), a missing commit, an empty diff, a deletion, a
// rename (diffed with --no-renames, so a rename is a deletion plus an addition), a mode-only change, or any path
// outside the three exported content locations. `content/examples/` holds test fixtures, so it is not content.
//
// CLI (GitHub Actions): `node scripts/ci/classify-changes.mjs` reads GITHUB_EVENT_NAME, GITHUB_EVENT_PATH and
// GITHUB_SHA, needs the full history (checkout fetch-depth 0), and appends `mode` and `files` (the changed content
// paths, one per line) to GITHUB_OUTPUT.
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

export function classify({ event, payload, sha, git }) {
  const range = diffBase({ event, payload, sha, git });
  if (range.full) return { mode: 'full', files: [], reason: range.full };
  // PRs check out the merge commit, so HEAD is the tree being tested; on push HEAD is `sha`.
  const head = event === 'pull_request' ? 'HEAD' : sha;
  const raw = git(['diff', '--raw', '-z', '--no-renames', '--no-abbrev', range.base, head]);
  return classifyEntries(parseRawDiff(raw));
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
  if (env.GITHUB_OUTPUT) {
    const eof = `EOF_${randomUUID()}`;
    appendFileSync(env.GITHUB_OUTPUT, `mode=${result.mode}\nfiles<<${eof}\n${result.files.join('\n')}\n${eof}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
