// Public contract v2 and the v1 reader (V2-05, IDEA_BOX §2 and §4). The v2 schemas live next to the v1 ones and the
// validator picks one by `schema_version`, so the v1 files stay byte-identical (the v1 exporter rewrites them on every
// publish). The fixture mixes a v1 day with a v2 day of two batches and exercises the editorial freedom of v2: no
// summary, no prompts, prompts without "Saber mais", a 45-minute read, free callouts, a free block order, and
// editorias left empty.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'astro';
import { afterAll, describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/validate-content.mjs';
import { EDITORIAS, readArticle, showsArticleTimes, V1_EDITORIA } from '../src/lib/content';
import { EDITORIA_LABELS, EDITORIA_SLUGS, knownLabel, RETIRED_CATEGORY_SLUGS, updatedLabel } from '../src/lib/labels';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'tests/fixtures/content-v2');
const OUT_PARENT = join(ROOT, 'node_modules', '.cache'); // same filesystem as the project (Astro renames assets)
const V1 = '33333333-3333-4333-8333-333333333331';
const [A, B, C] = ['44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443'];
const V2_EDITION = 'editions/2026-11-21.json';

// The v1 contracts as the engine exports them (v1 is frozen, D-079). A change here means a v1 file was edited.
const V1_SHA256 = {
  'article.schema.json': '8eb670c90e6e079690e4c8bc251eb06597f32a4ad9028d135e7bf98fb1a91a0c',
  'edition.schema.json': '5171dbed57250ec5d0f03b7cd8c7ac595296f1816ab05a3a50bdffadf31b9fbb',
  'tag_catalog.schema.json': '5de14e83d60dd6482480d02fcc08eaa3f77c43c19042606f786aacfe45914570',
};

const temps = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
function temp(prefix, parent = tmpdir()) {
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, prefix));
  temps.push(dir);
  return dir;
}

// Copy of the fixture with `mutate(doc)` applied to one file (`articles/<id>.json` or `editions/<date>.json`).
function variant(file, mutate) {
  const dir = temp('linkedia-v2-');
  cpSync(FIXTURE, dir, { recursive: true });
  const path = join(dir, file);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  mutate(doc);
  writeFileSync(path, JSON.stringify(doc));
  return dir;
}
const errorsOf = (file, mutate) => validateContent(variant(file, mutate)).errors;
const article = (id) => `articles/${id}.json`;

describe('contract v2: validation', () => {
  it('accepts the mixed v1 + v2 fixture and keeps the v1 schemas byte-identical', () => {
    expect(validateContent(FIXTURE)).toEqual({ errors: [], counts: { articles: 4, editions: 2, tags: 2 } });
    for (const [file, sha] of Object.entries(V1_SHA256)) {
      const bytes = readFileSync(join(ROOT, 'contracts', file));
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(sha);
    }
    const contracts = readdirSync(join(ROOT, 'contracts')).sort();
    expect(contracts).toEqual([
      'article.schema.json',
      'article.v2.schema.json',
      'edition.schema.json',
      'edition.v2.schema.json',
      'tag_catalog.schema.json',
    ]);
  });

  it('picks the schema by schema_version and rejects an unknown one', () => {
    expect(errorsOf(article(A), (d) => (d.schema_version = '3.0.0'))).toEqual([
      expect.stringContaining('schema_version desconhecida ("3.0.0"; aceitas: 1.0.0, 2.0.0)'),
      expect.stringContaining(`matéria inexistente "${A}"`),
    ]);
    // A v2 article checked against v1 fails (no channel, no summary…), and the other way round.
    expect(errorsOf(article(A), (d) => (d.schema_version = '1.0.0')).length).toBeGreaterThan(0);
    expect(errorsOf(article(V1), (d) => (d.schema_version = '2.0.0')).length).toBeGreaterThan(0);
    // `constructor` is not a version: only the map's own keys count.
    expect(errorsOf(article(A), (d) => (d.schema_version = 'constructor'))[0]).toContain('schema_version desconhecida');
  });

  it('leaves v1 as strict as before: exactly one "Saber mais" and the 30-minute cap', () => {
    expect(errorsOf(article(V1), (d) => (d.prompt_actions[0].kind = 'lab')).length).toBeGreaterThan(0);
    expect(errorsOf(article(V1), (d) => (d.read_minutes = 31)).length).toBeGreaterThan(0);
    expect(errorsOf(article(V1), (d) => delete d.summary).length).toBeGreaterThan(0);
  });

  it('keeps the technical fields of v2 strict', () => {
    const strict = {
      'no published_at': (d) => delete d.published_at,
      'no title': (d) => delete d.title,
      'no blocks': (d) => (d.blocks = []),
      'no sources': (d) => (d.sources = []),
      'http source': (d) => (d.sources[0].url = 'http://example.org/x'),
      'bad slug': (d) => (d.slug = 'Slug Ruim'),
      'unknown editoria': (d) => (d.editoria = 'ai_engineering'),
      'AI disclosure off': (d) => (d.editorial_metadata.ai_generated = false),
      'extra field': (d) => (d.extra = 1),
      'free callout id with spaces': (d) => (d.blocks[2].variant = 'Bad Variant'),
      'unknown block type': (d) => d.blocks.push({ type: 'html', text: '<b>x</b>' }),
      'heading level 1': (d) => (d.blocks[1].level = 1),
      'tag outside the pattern': (d) => (d.tags = ['Saúde']),
      'zero minutes': (d) => (d.read_minutes = 0),
      'image without a source': (d) =>
        d.blocks.push({ type: 'image', image_url: 'https://e.org/a.png', alt: 'a', long_description: 'x'.repeat(20), credit: 'c' }),
    };
    for (const [name, mutate] of Object.entries(strict)) expect(errorsOf(article(A), mutate).length, name).toBeGreaterThan(0);
    expect(errorsOf(article(A), (d) => (d.blocks[0].source_ids = ['s9']))).toEqual([
      expect.stringContaining('/blocks/0 cita a fonte inexistente "s9"'),
    ]);
  });

  it('checks a v2 edition against its articles: one version, its date, its batch window', () => {
    expect(errorsOf(V2_EDITION, (d) => d.article_ids.push(V1))).toEqual([
      expect.stringContaining(`matéria "${V1}" na versão 1.0.0, edição na 2.0.0`),
    ]);
    expect(errorsOf(V2_EDITION, (d) => (d.updated_at = '2026-11-21T08:00:00-03:00'))).toEqual(
      expect.arrayContaining([expect.stringContaining('updated_at anterior a published_at')]),
    );
    expect(errorsOf(article(C), (d) => (d.published_at = '2026-11-21T19:00:00-03:00'))).toEqual([
      expect.stringContaining(`published_at da matéria "${C}" fora de [published_at, updated_at]`),
    ]);
    expect(errorsOf(article(B), (d) => (d.edition_date = '2026-11-20'))).toEqual([
      expect.stringContaining(`matéria "${B}" com edition_date 2026-11-20`),
    ]);
    expect(errorsOf(V2_EDITION, (d) => delete d.updated_at).length).toBeGreaterThan(0);
    // The legacy theme field is optional in v2 (D-081).
    expect(errorsOf(V2_EDITION, (d) => (d.visual_theme_id = null))).toEqual([]);
  });
});

describe('contract v2: reader helpers', () => {
  it('maps every v1 channel to an editoria and leaves v2 articles as they are', () => {
    expect(V1_EDITORIA).toEqual({
      ai_engineering: 'ai_engineering_knowledge',
      ai_knowledge: 'ai_engineering_knowledge',
      ai_leadership: 'ai_leadership',
    });
    const v1 = JSON.parse(readFileSync(join(FIXTURE, article(V1)), 'utf8'));
    const read = readArticle(v1);
    expect(read.editoria).toBe('ai_engineering_knowledge');
    expect(read).not.toHaveProperty('channel');
    expect({ ...read, editoria: undefined }).toEqual({ ...v1, channel: undefined, editoria: undefined }); // nothing else changes
    expect(v1.channel).toBe('ai_knowledge'); // the file's object is not mutated
    const v2 = JSON.parse(readFileSync(join(FIXTURE, article(A)), 'utf8'));
    expect(readArticle(v2)).toBe(v2);
  });

  it('has six editorias with distinct labels and slugs, none reusing a retired slug', () => {
    expect(EDITORIAS).toHaveLength(6);
    expect(EDITORIA_LABELS.ai_engineering_knowledge).toBe('IA na prática');
    expect(EDITORIA_LABELS.latest_news).toBe('Novidades de IA');
    const slugs = EDITORIAS.map((e) => EDITORIA_SLUGS[e]);
    expect(new Set(slugs).size).toBe(6);
    expect(new Set(EDITORIAS.map((e) => EDITORIA_LABELS[e])).size).toBe(6);
    for (const slug of RETIRED_CATEGORY_SLUGS) expect(slugs).not.toContain(slug);
  });

  it('labels a later batch the same day, across midnight, and not at all for one batch or v1', () => {
    const tz = 'America/Sao_Paulo';
    const first = '2026-11-21T09:00:00-03:00';
    expect(updatedLabel({ published_at: first, updated_at: '2026-11-21T18:30:00-03:00', timezone: tz })).toBe('atualizada às 18:30');
    expect(updatedLabel({ published_at: first, updated_at: '2026-11-22T00:30:00-03:00', timezone: tz })).toBe(
      'atualizada em 22 de novembro de 2026, às 00:30',
    );
    expect(updatedLabel({ published_at: first, updated_at: first, timezone: tz })).toBe('');
    expect(updatedLabel({ published_at: first, timezone: tz })).toBe('');
    expect(showsArticleTimes([{ published_at: first }, { published_at: first }])).toBe(false);
    expect(showsArticleTimes([{ published_at: first }, { published_at: '2026-11-21T18:30:00-03:00' }])).toBe(true);
    expect(showsArticleTimes([{}, {}])).toBe(false);
  });

  it('never reads a label from Object.prototype for a free id', () => {
    expect(knownLabel({ note: 'Nota' }, 'constructor', 'Nota')).toBe('Nota');
    expect(knownLabel({ note: 'Nota' }, '__proto__', 'Nota')).toBe('Nota');
    expect(knownLabel({ lab: 'Laboratório' }, 'lab', 'Prompt')).toBe('Laboratório');
    expect(knownLabel({ lab: 'Laboratório' }, undefined, 'Prompt')).toBe('Prompt');
  });
});

describe('contract v2: rendering', async () => {
  const out = temp('linkedia-dist-', OUT_PARENT);
  const env = { LINKEDIA_CONTENT_DIR: FIXTURE };
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    await build({ root: ROOT, outDir: out, logLevel: 'error' });
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const page = (p) => readFileSync(join(out, p), 'utf8');
  const main = (p) => page(p).match(/<main[\s\S]*<\/main>/)[0];
  const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const count = (html, needle) => html.split(needle).length - 1;

  it('emits the six category pages and every story of both versions', () => {
    for (const slug of Object.values(EDITORIA_SLUGS)) expect(() => page(`categorias/${slug}.html`), slug).not.toThrow();
    for (const slug of RETIRED_CATEGORY_SLUGS) expect(() => page(`categorias/${slug}.html`), slug).toThrow();
    for (const slug of ['materia-v1-conhecimento', 'saude-sem-resumo', 'china-prompts-livres', 'novidade-do-segundo-lote']) {
      expect(() => page(`materias/${slug}.html`), slug).not.toThrow();
    }
    // Only some editorias are filled; the others say so, without a placeholder card.
    const filled = { 'ia-na-pratica': 1, saude: 1, china: 1, 'novidades-de-ia': 1, 'lideranca-de-ia': 0, marketing: 0 };
    for (const [slug, n] of Object.entries(filled)) {
      const html = main(`categorias/${slug}.html`);
      expect(count(html, 'data-card'), slug).toBe(n);
      expect(html.includes('Nenhuma matéria publicada nesta categoria ainda.'), slug).toBe(n === 0);
    }
    expect(main('categorias/ia-na-pratica.html')).toContain('href="/materias/materia-v1-conhecimento"');
  });

  it('shows the last published day on the home, with the first time, the update and each batch time', () => {
    const html = main('revista.html');
    expect(html).toContain('data-edition="2026-11-21"');
    expect(text(html)).toContain('Publicada em 21 de novembro de 2026, às 09:00 · atualizada às 18:30');
    expect([...html.matchAll(/data-article-time>· publicada às <time datetime="([^"]+)">([^<]+)</g)].map((m) => m[2])).toEqual([
      '09:00',
      '09:00',
      '18:30',
    ]);
    // A static build has no clock: built on any later day, the home still shows this edition with its real date.
    expect(html).not.toMatch(/\bhoje\b/i);
  });

  it('renders a v1 edition and story as before: no per-story time, no update line', () => {
    const edition = main('edicoes/2026-11-20.html');
    expect(text(edition)).toContain('Publicada em 20 de novembro de 2026, às 19:00');
    expect(edition).not.toContain('data-article-time');
    expect(edition).not.toContain('data-edition-updated');
    const story = main('materias/materia-v1-conhecimento.html');
    expect(story).toContain('<a href="/categorias/ia-na-pratica">IA na prática</a>');
    expect(story).not.toContain('data-article-time');
    expect(story).toContain('data-summary');
    expect(story).toContain('data-kind="read_more"');
  });

  it('renders the editorial freedom of v2 without placeholders', () => {
    const free = main('materias/saude-sem-resumo.html');
    expect(free).not.toContain('data-summary');
    expect(free).not.toContain('data-prompts');
    expect(text(free)).toContain('45 min de leitura');
    expect(free).toContain(
      '2026</time></a><span data-article-time>, às <time datetime="2026-11-21T09:00:00-03:00">09:00</time></span>',
    );
    expect(free).toContain('<h3 data-block="heading">Uma seção que começa no nível 3</h3>');
    expect(text(free)).toContain('Contraponto: Uma variante livre com rótulo próprio.');
    expect(text(free)).toContain('Nota: Variante livre sem rótulo cai em Nota.');
    expect(free.indexOf('data-block="list"')).toBeLessThan(free.indexOf('data-block="heading"')); // order kept
    // No summary: the default description, never an empty or "undefined" one.
    expect(page('materias/saude-sem-resumo.html')).toContain(
      '<meta name="description" content="Revista diária sobre engenharia de IA, liderança em IA e conhecimento em IA.">',
    );
    const prompts = main('materias/china-prompts-livres.html');
    expect(prompts).toContain('data-prompts');
    expect(prompts).not.toContain('data-kind="read_more"');
    expect(text(prompts)).not.toContain('(Saber mais)');
    expect(count(prompts, 'data-prompt-action')).toBe(3);
    expect(text(prompts)).toContain('Teste você mesmo (Laboratório)');
    expect(text(prompts)).toContain('Sem tipo (Prompt)');
    expect(text(prompts)).toContain('Tipo estranho (Prompt)');
    // An empty prompt list renders no section either.
    expect(main('materias/novidade-do-segundo-lote.html')).not.toContain('data-prompts');
    // The home card of the summary-less story has no empty paragraph.
    const card = main('revista.html').match(/<article data-card[^>]*data-editoria="health"[\s\S]*?<\/article>/)[0];
    expect(card).not.toMatch(/<p>\s*<\/p>/);
  });

  it('escapes hostile text in the new v2 fields', async () => {
    const X = '<script>alert(1)</script><img src=x onerror=alert(2)>" onmouseover="alert(3)';
    const dir = variant(article(A), (d) => {
      d.title = `Título ${X}`;
      d.blocks[2].label = `Rótulo ${X}`.slice(0, 60);
      d.blocks[0].items = [`Item ${X}`];
      d.prompt_actions = [{ label: `Prompt ${X}`.slice(0, 120), prompt: `Peça ${X}` }];
    });
    const hostileOut = temp('linkedia-dist-', OUT_PARENT);
    Object.assign(process.env, { LINKEDIA_CONTENT_DIR: dir });
    try {
      await build({ root: ROOT, outDir: hostileOut, logLevel: 'error' });
    } finally {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    for (const p of ['materias/saude-sem-resumo.html', 'revista.html', 'categorias/saude.html', 'edicoes/2026-11-21.html']) {
      const html = readFileSync(join(hostileOut, p), 'utf8');
      expect(html, p).not.toContain('<script>alert');
      expect(html, p).not.toContain('<img src=x');
      expect(html, p).not.toContain('onmouseover="alert'); // no attribute breakout
      expect(html, p).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }
  });

  it('prints no undefined, null or NaN anywhere', () => {
    const pages = (dir, prefix = '') =>
      readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? pages(dir, join(prefix, e.name)) : e.name.endsWith('.html') ? [join(prefix, e.name)] : [],
      );
    for (const p of pages(out).filter((p) => !p.startsWith('especiais/') && !p.startsWith('visual'))) {
      expect(text(page(p)), p).not.toMatch(/\b(undefined|null|NaN)\b/);
    }
  });
});
