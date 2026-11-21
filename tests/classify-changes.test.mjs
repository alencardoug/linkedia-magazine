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
// Minimal valid exports: the classifier reads `article_ids`, `tags` and catalog entries; `rev` makes a new version.
const article = (path, tags = ['topic:agents'], rev = 1) => write(path, JSON.stringify({ rev, tags }));
const edition = (path, ids = [ID], rev = 1) => write(path, JSON.stringify({ rev, article_ids: ids }));
const catalog = (tags) => write('content/tags/catalog.json', JSON.stringify({ tags }));
const TAG = (key, label = key) => ({ key, kind: key.split(':')[0], label });
const push = (before, sha, extra = {}) => classify({ event: 'push', payload: { before, ...extra }, sha, git });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'classify-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'core.fileMode', 'true']);
  article(ARTICLE);
  edition('content/editions/2026-11-09.json');
  catalog([TAG('topic:agents'), TAG('topic:rag')]);
  write('src/pages/index.astro');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('content-only pushes', () => {
  it('an engine export (new article, new edition, catalog edit) is content', () => {
    const before = commit('base');
    article(`content/articles/${ID2}.json`, ['topic:new']);
    edition('content/editions/2026-11-21.json', [ID2]);
    catalog([TAG('topic:agents'), TAG('topic:rag'), TAG('topic:new')]);
    const sha = commit('export');
    expect(push(before, sha)).toEqual({
      mode: 'content',
      files: ['content/articles/' + ID2 + '.json', 'content/editions/2026-11-21.json', 'content/tags/catalog.json'],
      affected: [],
      reason: 'content only',
    });
  });

  it('several commits in one push are diffed as a range', () => {
    const before = commit('base');
    article(ARTICLE, undefined, 2);
    commit('one');
    edition('content/editions/2026-11-09.json', [ID], 2);
    const sha = commit('two');
    expect(push(before, sha).mode).toBe('content');
  });
});

describe('pages a content change alters without touching their files', () => {
  beforeEach(() => article(`content/articles/${ID2}.json`, ['topic:rag']));

  it('an edition-only change lists the articles it lists, before and after', () => {
    edition('content/editions/2026-11-09.json', [ID]);
    const before = commit('base');
    edition('content/editions/2026-11-09.json', [ID2], 2);
    expect(push(before, commit('swap'))).toMatchObject({ mode: 'content', affected: [ARTICLE, `content/articles/${ID2}.json`] });
  });

  it('a new edition lists its articles', () => {
    const before = commit('base');
    edition('content/editions/2026-11-21.json', [ID2]);
    expect(push(before, commit('new edition')).affected).toEqual([`content/articles/${ID2}.json`]);
  });

  it('a catalog-only change lists the articles that use an edited, added or removed entry', () => {
    const before = commit('base');
    catalog([TAG('topic:agents', 'Agentes de IA')]); // edits topic:agents, removes topic:rag
    expect(push(before, commit('catalog'))).toMatchObject({ mode: 'content', affected: [ARTICLE, `content/articles/${ID2}.json`] });
  });

  it('a catalog change that only adds an unused entry, or reorders, lists nothing', () => {
    const before = commit('base');
    catalog([TAG('topic:rag'), TAG('topic:agents'), TAG('topic:unused')]);
    expect(push(before, commit('catalog')).affected).toEqual([]);
  });

  it('a changed article is not listed twice', () => {
    const before = commit('base');
    article(ARTICLE, undefined, 2);
    edition('content/editions/2026-11-09.json', [ID, ID2], 2);
    expect(push(before, commit('both'))).toMatchObject({ files: [ARTICLE, 'content/editions/2026-11-09.json'], affected: [`content/articles/${ID2}.json`] });
  });

  it('content that cannot be read runs full', () => {
    const before = commit('base');
    write('content/editions/2026-11-09.json', 'not json\n');
    expect(push(before, commit('broken'))).toMatchObject({ mode: 'full', reason: expect.stringMatching(/^affected pages unresolved/) });
  });
});

describe('everything else is full', () => {
  it('a code change, alone or mixed with content', () => {
    const before = commit('base');
    article(ARTICLE, undefined, 2);
    write('src/pages/index.astro', 'v2\n');
    expect(push(before, commit('mixed'))).toMatchObject({ mode: 'full', reason: 'non-content path src/pages/index.astro' });
  });

  it('a code change hidden in an earlier commit of the range', () => {
    const before = commit('base');
    write('src/pages/index.astro', 'v2\n');
    commit('code');
    article(ARTICLE, undefined, 2);
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
    article(ARTICLE, undefined, 2);
    const old = commit('old');
    git(['reset', '-q', '--hard', base]);
    article(ARTICLE, undefined, 3);
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
    article(ARTICLE, undefined, 2);
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
