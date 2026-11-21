// V2-01: the push classifier must never call a change content-only unless it provably is. Runs against a real
// throwaway Git repository so renames, deletions, mode changes and force pushes go through git itself.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classify, classifyEntries } from '../scripts/ci/classify-changes.mjs';

const ID = '6835e918-8a3d-43b2-bcf0-4cf64448a7d0';
const ID2 = 'c0fd1b70-9f2e-483d-832e-a77c666c39d3';
const ARTICLE = `content/articles/${ID}.json`;

let dir;
const git = (args) =>
  execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
const write = (path, text = `${path}\n`) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const commit = (msg) => {
  git(['add', '-A']);
  git(['commit', '-q', '--allow-empty', '-m', msg]);
  return git(['rev-parse', 'HEAD']).trim();
};
const push = (before, sha, extra = {}) => classify({ event: 'push', payload: { before, ...extra }, sha, git });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'classify-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'core.fileMode', 'true']);
  write(ARTICLE);
  write('content/editions/2026-11-09.json');
  write('content/tags/catalog.json');
  write('src/pages/index.astro');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('content-only pushes', () => {
  it('an engine export (new article, new edition, catalog edit) is content', () => {
    const before = commit('base');
    write(`content/articles/${ID2}.json`);
    write('content/editions/2026-11-21.json');
    write('content/tags/catalog.json', 'changed\n');
    const sha = commit('export');
    expect(push(before, sha)).toEqual({
      mode: 'content',
      files: ['content/articles/' + ID2 + '.json', 'content/editions/2026-11-21.json', 'content/tags/catalog.json'],
      reason: 'content only',
    });
  });

  it('several commits in one push are diffed as a range', () => {
    const before = commit('base');
    write(ARTICLE, 'v2\n');
    commit('one');
    write('content/editions/2026-11-09.json', 'v2\n');
    const sha = commit('two');
    expect(push(before, sha).mode).toBe('content');
  });
});

describe('everything else is full', () => {
  it('a code change, alone or mixed with content', () => {
    const before = commit('base');
    write(ARTICLE, 'v2\n');
    write('src/pages/index.astro', 'v2\n');
    expect(push(before, commit('mixed'))).toMatchObject({ mode: 'full', reason: 'non-content path src/pages/index.astro' });
  });

  it('a code change hidden in an earlier commit of the range', () => {
    const before = commit('base');
    write('src/pages/index.astro', 'v2\n');
    commit('code');
    write(ARTICLE, 'v2\n');
    expect(push(before, commit('content')).mode).toBe('full');
  });

  it('a deletion of content', () => {
    const before = commit('base');
    rmSync(join(dir, ARTICLE));
    expect(push(before, commit('rm'))).toMatchObject({ mode: 'full', reason: `status D on ${ARTICLE}` });
  });

  it('a rename inside content', () => {
    const before = commit('base');
    renameSync(join(dir, ARTICLE), join(dir, `content/articles/${ID2}.json`));
    expect(push(before, commit('mv')).mode).toBe('full');
  });

  it('a rename from code into content', () => {
    const before = commit('base');
    mkdirSync(join(dir, 'content/articles'), { recursive: true });
    renameSync(join(dir, 'src/pages/index.astro'), join(dir, `content/articles/${ID2}.json`));
    expect(push(before, commit('mv')).mode).toBe('full');
  });

  it('an executable bit on a content file', () => {
    const before = commit('base');
    chmodSync(join(dir, ARTICLE), 0o755);
    expect(push(before, commit('chmod'))).toMatchObject({ mode: 'full', reason: `file mode change on ${ARTICLE}` });
  });

  it('example fixtures, other content files and odd names', () => {
    for (const path of [
      'content/examples/articles/x.json',
      'content/articles/README.md',
      'content/articles/not-a-uuid.json',
      'content/editions/2026-11-21.json.bak',
      'content/tags/other.json',
      'contracts/article.schema.json',
    ]) {
      expect(classifyEntries([{ status: 'M', path, oldMode: '100644', newMode: '100644' }]).mode).toBe('full');
    }
  });

  it('an empty range', () => {
    const before = commit('base');
    expect(push(before, commit('empty'))).toMatchObject({ mode: 'full', reason: 'empty diff' });
  });

  it('the first push of a ref', () => {
    const sha = commit('base');
    expect(push('0000000000000000000000000000000000000000', sha).mode).toBe('full');
    expect(push(undefined, sha).mode).toBe('full');
  });

  it('a force push, flagged or detected', () => {
    const base = commit('base');
    write(ARTICLE, 'old\n');
    const old = commit('old');
    git(['reset', '-q', '--hard', base]);
    write(ARTICLE, 'new\n');
    const sha = commit('new');
    expect(push(old, sha)).toMatchObject({ mode: 'full', reason: 'previous head missing or not an ancestor' });
    expect(push(base, sha, { forced: true })).toMatchObject({ mode: 'full', reason: 'force push' });
  });

  it('a previous head that is not in the clone', () => {
    const sha = commit('base');
    expect(push('1234567890123456789012345678901234567890', sha).mode).toBe('full');
  });

  it('manual runs and unknown events', () => {
    const sha = commit('base');
    for (const event of ['workflow_dispatch', 'schedule', undefined]) {
      expect(classify({ event, payload: {}, sha, git }).mode).toBe('full');
    }
  });
});

describe('pull requests', () => {
  it('diff the tested tree against the base', () => {
    const base = commit('base');
    write(ARTICLE, 'v2\n');
    commit('content');
    expect(classify({ event: 'pull_request', payload: { pull_request: { base: { sha: base } } }, sha: 'x', git }).mode).toBe(
      'content',
    );
    write('src/pages/index.astro', 'v2\n');
    commit('code');
    expect(classify({ event: 'pull_request', payload: { pull_request: { base: { sha: base } } }, sha: 'x', git }).mode).toBe(
      'full',
    );
    expect(classify({ event: 'pull_request', payload: {}, sha: 'x', git }).mode).toBe('full');
  });
});
