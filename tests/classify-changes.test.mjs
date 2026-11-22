// V2-01: the push classifier must never call a change content-only unless it provably is. Runs against a real
// throwaway Git repository so renames, deletions, mode changes and force pushes go through git itself.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classify, classifyEntries, coverImpact } from '../scripts/ci/classify-changes.mjs';

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
      covers: false,
      coversReason: 'reading-only paths',
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
    expect(push(before, commit('broken'))).toMatchObject({
      mode: 'full',
      reason: expect.stringMatching(/^affected pages unresolved/),
      covers: true,
      coversReason: expect.stringMatching(/^affected pages unresolved/),
    });
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

// V2-06c: the cover suite may be skipped only when every changed path is a known reading-only one.
describe('cover suite', () => {
  const entry = (path, status = 'M') => ({ status, path, oldMode: '100644', newMode: '100644' });
  const covers = (...paths) => coverImpact(paths.map((p) => entry(p))).covers;

  it('cover-only changes run it', () => {
    for (const path of [
      'src/covers/sismograma/draw.ts',
      'src/covers/registry.ts',
      'src/layouts/CoverPage.astro',
      'src/layouts/cover-shell.css',
      'src/layouts/Base.astro',
      'src/pages/index.astro',
      'src/pages/visual.astro',
      'src/pages/visual/micelio.astro',
      'e2e/cover.spec.mjs',
    ])
      expect(covers(path), path).toBe(true);
  });

  it('shared-only changes run it', () => {
    for (const path of [
      'firebase.json',
      'package.json',
      'package-lock.json',
      'astro.config.mjs',
      'playwright.config.mjs',
      'tsconfig.json',
      '.nvmrc',
      'scripts/css-modes.mjs',
      '.github/workflows/deploy.yml',
      'e2e/helpers.mjs',
      'public/modo.js',
      'src/lib/content.ts',
      'src/styles/site.css',
      'src/types/contracts.d.ts',
      'contracts/article.v2.schema.json',
      'content/examples/articles/x.json',
      'tests/fixtures/content-v2/editions/2026-11-20.json',
    ])
      expect(covers(path), path).toBe(true);
  });

  it('reading-only changes skip it', () => {
    expect(
      coverImpact(
        [
          'src/pages/revista.astro',
          'src/pages/materias/[slug].astro',
          'src/components/ArticleCard.astro',
          'src/specials/x.ts',
          'src/layouts/SpecialLayout.astro',
          'public/especiais/perguntar-ao-banco/index.html',
          `content/articles/${ID}.json`,
          'docs/COVERS.md',
          'README.md',
          'e2e/modes.spec.mjs',
          'tests/mode.test.mjs',
        ].map((p) => entry(p)),
      ),
    ).toEqual({ covers: false, reason: 'reading-only paths' });
  });

  it('a mixed change runs it, whatever the order', () => {
    expect(covers('src/pages/revista.astro', 'src/covers/registry.ts')).toBe(true);
    expect(covers('src/styles/site.css', 'docs/COVERS.md')).toBe(true);
  });

  it('unknown paths and an empty diff run it', () => {
    for (const path of ['src/new-dir/x.ts', 'src/layouts/Other.astro', 'Makefile', 'docs'])
      expect(covers(path), path).toBe(true);
    expect(coverImpact([]).covers).toBe(true);
  });

  it('renames and deletions are judged on both paths (real git)', () => {
    write('src/covers/micelio/field.ts');
    write('src/components/Old.astro');
    const before = commit('base');
    renameSync(join(dir, 'src/covers/micelio/field.ts'), join(dir, 'src/components/Field.ts'));
    expect(push(before, commit('mv cover → reading'))).toMatchObject({ mode: 'full', covers: true, coversReason: 'cover file src/covers/micelio/field.ts' });
    const mid = git(['rev-parse', 'HEAD']).trim();
    rmSync(join(dir, 'src/components/Old.astro'));
    expect(push(mid, commit('rm reading'))).toMatchObject({ mode: 'full', covers: false });
    const mid2 = git(['rev-parse', 'HEAD']).trim();
    rmSync(join(dir, 'src/pages/index.astro'));
    expect(push(mid2, commit('rm cover'))).toMatchObject({ covers: true, coversReason: 'cover file src/pages/index.astro' });
  });

  it('a reading-only code push is full without covers; a cover change hidden in the range runs them', () => {
    write('src/pages/revista.astro');
    const before = commit('base');
    write('src/pages/revista.astro', 'v2\n');
    expect(push(before, commit('reading'))).toMatchObject({ mode: 'full', covers: false });
    write('src/covers/registry.ts');
    commit('cover');
    write('src/pages/revista.astro', 'v3\n');
    expect(push(before, commit('reading again'))).toMatchObject({ mode: 'full', covers: true });
  });

  it('no diff (first push, force push, manual run, missing head, PR without base) runs it', () => {
    const base = commit('base');
    expect(push('0000000000000000000000000000000000000000', base).covers).toBe(true);
    expect(push(base, base, { forced: true }).covers).toBe(true);
    expect(push('1234567890123456789012345678901234567890', base).covers).toBe(true);
    expect(classify({ event: 'workflow_dispatch', payload: {}, sha: base, git }).covers).toBe(true);
    expect(classify({ event: 'pull_request', payload: {}, sha: 'x', git }).covers).toBe(true);
  });

  it('the CLI writes covers=true when classification throws (PR base not in the clone)', () => {
    commit('base');
    const event = join(dir, 'event.json');
    const out = join(dir, 'out.txt');
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: '1234567890123456789012345678901234567890' } } }));
    execFileSync('node', [resolve('scripts/ci/classify-changes.mjs')], {
      cwd: dir,
      env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_SHA: 'x', GITHUB_OUTPUT: out },
      stdio: 'pipe',
    });
    const text = readFileSync(out, 'utf8');
    expect(text).toMatch(/^mode=full\ncovers=true\n/);
  });
});
