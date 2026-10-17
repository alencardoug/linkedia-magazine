// Static build (1B-01): every route is emitted from a content dir, and model-produced text is always escaped.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'astro';
import { afterAll, describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/validate-content.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const EXAMPLES = join(ROOT, 'content/examples');
// Breaks out of text (tags) and of a quoted attribute (`"` + event handler).
const X = '<script>alert(1)</script><img src=x onerror=alert(2)>" onmouseover="alert(3)';
const temps = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function buildSite(contentDir) {
  const outDir = temp('linkedia-dist-');
  const previous = process.env.LINKEDIA_CONTENT_DIR;
  process.env.LINKEDIA_CONTENT_DIR = contentDir;
  try {
    await build({ root: ROOT, outDir, logLevel: 'error' });
  } finally {
    if (previous === undefined) delete process.env.LINKEDIA_CONTENT_DIR;
    else process.env.LINKEDIA_CONTENT_DIR = previous;
  }
  return outDir;
}

function htmlFiles(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(dir, join(prefix, e.name)) : e.name.endsWith('.html') ? [join(prefix, e.name)] : [],
  );
}

// Two valid articles with hostile text in every text field and every block type.
function hostileArticle(n) {
  const id = `2222222${n}-2222-4222-8222-222222222222`;
  return {
    schema_version: '1.0.0',
    article_id: id,
    slug: `materia-hostil-${n}`,
    edition_date: '2026-10-15',
    locale: 'pt-BR',
    channel: n === 1 ? 'ai_engineering' : 'ai_leadership',
    title: `Título ${X}`,
    summary: `Resumo ${X}`,
    read_minutes: 3,
    tags: ['topic:hostil'],
    sources: [
      {
        source_id: 's1',
        title: `Fonte ${X}`,
        url: 'https://example.com/fonte?q=%3Cscript%3E',
        publisher: `Editora ${X}`,
        published_at: '2026-10-14',
        accessed_at: '2026-10-15T10:00:00-03:00',
        attribution: `Atribuição ${X}`,
      },
    ],
    blocks: [
      { type: 'paragraph', text: `Parágrafo ${X}`, source_ids: ['s1'] },
      { type: 'heading', text: `Seção ${X}`, level: 2 },
      { type: 'list', ordered: n === 1, items: [`Item ${X}`], source_ids: ['s1'] },
      { type: 'quote', text: `Citação ${X}`, attribution: `Autor ${X}`, source_ids: ['s1'] },
      { type: 'callout', variant: 'warning', text: `Aviso ${X}` },
      { type: 'code', language: 'html', code: `<p>${X}</p>`, caption: `Legenda ${X}` },
      {
        type: 'diagram',
        diagram_format: 'mermaid',
        diagram_spec: `graph TD; A-->B; %% ${X}`,
        alt: `Diagrama ${X}`,
        long_description: `Descrição longa do diagrama ${X}`,
        caption: `Legenda ${X}`,
      },
      {
        type: 'image',
        image_url: 'https://images.example.com/a.png',
        alt: `Imagem ${X}`,
        long_description: `Descrição longa da imagem ${X}`,
        credit: `Crédito ${X}`,
        caption: `Legenda ${X}`,
        source_ids: ['s1'],
      },
    ],
    prompt_actions: [{ kind: 'read_more', label: `Saber ${X}`.slice(0, 60), prompt: `Explique isto em detalhes ${X}` }],
    editorial_metadata: {
      content_version: 1,
      generated_at: '2026-10-15T10:00:00-03:00',
      reviewed_sources: true,
      ai_generated: true,
      model: null,
      run_ref: null,
      supersedes_article_id: null,
    },
  };
}

function hostileContent() {
  const dir = temp('linkedia-hostile-');
  const write = (path, doc) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(doc));
  };
  const articles = [hostileArticle(1), hostileArticle(2)];
  for (const a of articles) write(`articles/${a.article_id}.json`, a);
  write('editions/2026-10-15.json', {
    schema_version: '1.0.0',
    edition_date: '2026-10-15',
    title: `Edição ${X}`,
    summary: `Resumo da edição ${X}`,
    article_ids: articles.map((a) => a.article_id),
    published_at: '2026-10-15T19:00:00-03:00',
    timezone: 'America/Sao_Paulo',
  });
  write('tags/catalog.json', {
    schema_version: '1.0.0',
    tags: [{ key: 'topic:hostil', kind: 'topic', label: `Tag ${X}`.slice(0, 60) }],
  });
  return dir;
}

describe('static build', () => {
  it('emits every route from the examples', async () => {
    const out = await buildSite(EXAMPLES);
    expect(htmlFiles(out).sort()).toEqual(
      [
        'index.html',
        'edicoes.html',
        'edicoes/2026-10-14.html',
        'materias/exemplo-de-materia-linkedia.html',
        'categorias/engenharia-de-ia.html',
        'categorias/lideranca-de-ia.html',
        'categorias/conhecimento-de-ia.html',
      ].sort(),
    );
    const article = readFileSync(join(out, 'materias/exemplo-de-materia-linkedia.html'), 'utf8');
    expect(article).toContain('Exemplo ilustrativo de matéria');
    expect(article).toContain('id="fonte-s1"');
    expect(article).toContain('data-copy-status');
  }, 120_000);

  it('escapes hostile text in every field and loads no image from an unlisted host', async () => {
    const dir = hostileContent();
    expect(validateContent(dir).errors).toEqual([]);
    const out = await buildSite(dir);
    const pages = htmlFiles(out);
    expect(pages).toContain('materias/materia-hostil-1.html');
    let escaped = 0;
    for (const page of pages) {
      const html = readFileSync(join(out, page), 'utf8');
      expect(html, page).not.toContain('onmouseover="alert');  // no attribute breakout
      // Inside a quoted attribute `<` is inert text; outside attributes no hostile tag may appear.
      const outsideAttributes = html.replace(/="[^"]*"/g, '=""');
      expect(outsideAttributes, page).not.toContain('<script>alert');
      expect(outsideAttributes, page).not.toContain('<img src=x');
      expect(html, page).not.toContain('images.example.com');
      escaped += html.split('&lt;script&gt;alert').length - 1;
    }
    const article = readFileSync(join(out, 'materias/materia-hostil-1.html'), 'utf8');
    // title, summary, 8 blocks' texts, source fields, tag label, prompt: each appears escaped
    expect(article.split('&lt;script&gt;alert').length - 1).toBeGreaterThanOrEqual(20);
    expect(escaped).toBeGreaterThan(30);
    expect(existsSync(join(out, 'materias/materia-hostil-2.html'))).toBe(true);
  }, 120_000);

  it('renders an empty magazine without editions', async () => {
    const out = await buildSite(temp('linkedia-empty-'));
    expect(htmlFiles(out).sort()).toEqual(
      [
        'index.html',
        'edicoes.html',
        'categorias/engenharia-de-ia.html',
        'categorias/lideranca-de-ia.html',
        'categorias/conhecimento-de-ia.html',
      ].sort(),
    );
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('Nenhuma edição publicada ainda.');
  }, 120_000);
});
