// Static build (1B-01): every route is emitted from a content dir, and model-produced text is always escaped.
// Themes (1C-01): the build ships the slotted themes only, and the switcher appears once a lab theme exists.
// Covers (3-01): `/` and `/visual/<slug>` are cover pages with their own shell and code; reading pages load none of it.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'astro';
import { afterAll, describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/validate-content.mjs';
import { COVERS, CURRENT_COVER } from '../src/covers/registry';
import { SPECIALS } from '../src/lib/specials';
import { THEME_INIT_SCRIPT } from '../src/lib/theme-init';

const ROOT = resolve(import.meta.dirname, '..');
const EXAMPLES = join(ROOT, 'content/examples');
const FIXTURE_THEMES = join(ROOT, 'tests/fixtures/themes');
// Breaks out of text (tags) and of a quoted attribute (`"` + event handler).
const X = '<script>alert(1)</script><img src=x onerror=alert(2)>" onmouseover="alert(3)';
const temps = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

// Build output must sit on the project's filesystem: Astro moves bundled assets with rename(), which fails
// across devices (EXDEV) when /tmp is a separate mount.
const OUT_PARENT = join(ROOT, 'node_modules', '.cache');

function temp(prefix, parent = tmpdir()) {
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, prefix));
  temps.push(dir);
  return dir;
}

// A themes dir from the fixtures, changed by `mutate(dir, manifest)`. `bootstrap` = the baseline only, the state
// before the first experiment (the real themes/manifest.json changes weekly, so tests do not build from it).
function themesVariant(mutate = () => {}) {
  const dir = temp('linkedia-themes-', OUT_PARENT);
  cpSync(FIXTURE_THEMES, dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  mutate(dir, manifest);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}
const bootstrap = () =>
  themesVariant((_, m) => {
    Object.assign(m, { previous_theme_id: null, current_theme_id: null, week_id: null });
    m.themes = m.themes.filter((t) => t.kind === 'baseline');
  });

async function buildSite(contentDir, themesDir = bootstrap()) {
  const outDir = temp('linkedia-dist-', OUT_PARENT);
  const env = { LINKEDIA_CONTENT_DIR: contentDir, LINKEDIA_THEMES_DIR: themesDir };
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    await build({ root: ROOT, outDir, logLevel: 'error' });
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return outDir;
}

const assets = (out, ext) => readdirSync(join(out, '_astro')).filter((f) => f.endsWith(ext));
const read = (out, page) => readFileSync(join(out, page), 'utf8');
// Cover pages (3-01): the current cover at `/` and every cover in the archive.
const COVER_PAGES = ['index.html', ...COVERS.map((c) => `visual/${c.slug}.html`)];
const isCover = (page) => COVER_PAGES.includes(page);

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
        'revista.html',
        'visual.html',
        ...COVERS.map((c) => `visual/${c.slug}.html`),
        'edicoes.html',
        'edicoes/2026-10-14.html',
        'materias/exemplo-de-materia-linkedia.html',
        'categorias/engenharia-de-ia.html',
        'categorias/lideranca-de-ia.html',
        'categorias/conhecimento-de-ia.html',
        'especiais/governanca-de-ia.html',
        'sobre.html',
        '404.html',
      ].sort(),
    );
    // The editor is named on /sobre only; the AI note is in the footer of /revista only, each article carries its own
    // note instead (owner, 2026-10-19). No inline code or third-party file anywhere. Reading pages: one theme and client JS
    // only with copy buttons; cover pages: their own shell and only their own cover's script, within the budgets.
    const AI_NOTE_PAGES = ['revista.html'];
    for (const page of htmlFiles(out)) {
      const html = readFileSync(join(out, page), 'utf8');
      expect(html.includes('rel="author"'), page).toBe(page === 'sobre.html');
      expect(html.includes('Textos gerados com IA'), page).toBe(AI_NOTE_PAGES.includes(page));
      expect(html.includes('data-site-footer'), page).toBe(AI_NOTE_PAGES.includes(page));
      expect(html, page).not.toMatch(/<link[^>]+href="https?:/); // no third-party stylesheet or font
      // The CSP (firebase.json) allows only same-origin files: no inline script, style element or style attribute.
      expect(html, page).not.toMatch(/<script(?![^>]*\ssrc="\/_astro\/)[^>]*>/);
      expect(html, page).not.toMatch(/<style[\s>]|\sstyle=/);
      if (isCover(page)) {
        expect(html, page).toMatch(/^<!DOCTYPE html><html lang="pt-BR" data-cover="[a-z0-9-]+">/);
        expect(html, page).not.toContain('data-theme');
        expect(html, page).toContain('<a href="/revista" class="cover-skip">Pular a capa e ir para a revista</a>');
        expect(html, page).toMatch(/<a class="[^"]*" href="\/revista" draggable="false" data-enter>/);
        expect(html, page).toContain('href="/visual"');
        expect(html.match(/<h1[\s>]/g), page).toHaveLength(1);
        const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
        expect(scripts, page).toEqual([expect.stringMatching(/^\/_astro\/Cover\.astro_astro_type_script_index_0_lang\.[\w-]+\.js$/)]);
        // Budgets (docs/COVERS.md): the cover's JS, with every chunk it imports, ≤ 30 KB gzipped; its CSS ≤ 10 KB.
        const reach = (file, seen = new Set()) => {
          if (seen.has(file)) return seen;
          seen.add(file);
          const code = readFileSync(join(out, file), 'utf8');
          for (const m of code.matchAll(/(?:from|import)\s*\(?\s*"\.\/([\w.-]+\.js)"/g)) reach(`_astro/${m[1]}`, seen);
          return seen;
        };
        const gz = (files) => [...files].reduce((n, f) => n + gzipSync(readFileSync(join(out, f))).length, 0);
        expect(gz(reach(scripts[0].slice(1))), page).toBeLessThanOrEqual(30 * 1024);
        const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+)"/g)].map((m) => m[1]);
        expect(styles.length, page).toBeGreaterThan(0);
        expect(gz(styles), page).toBeLessThanOrEqual(10 * 1024);
        continue;
      }
      expect(html, page).toContain('<html lang="pt-BR" data-theme="minimal-dark">'); // no slots, no switcher
      expect(html, page).not.toContain('data-theme-switcher');
      expect(html, page).not.toContain('Cover.astro'); // no cover code on reading pages
      expect(html, page).toContain('<a href="/revista" data-brand>');
      expect(html, page).toContain('<a href="/visual">Visual</a>');
      expect(html.includes('<script'), page).toBe(html.includes('data-copy='));
      // Astro drops the line break between text and a link on the next line: "licençaCC BY 4.0".
      expect(html, page).not.toMatch(/[\p{L}.,;:]<a\s/u);
      // A scrollable code block must be reachable by keyboard (axe scrollable-region-focusable).
      expect(html, page).not.toMatch(/<pre(?![^>]*\stabindex="0")/);
    }
    const notFound = readFileSync(join(out, '404.html'), 'utf8');
    expect(notFound).toContain('Página não encontrada');
    expect(notFound).toContain('<a href="/revista">Ir para a edição mais recente</a>');
    expect(notFound).toContain('href="/edicoes"');
    // `/revista` is the edition home that `/` used to be; `/` is the current cover, with the edition's text.
    const home = read(out, 'revista.html');
    expect(home).toContain('data-edition="2026-10-14"');
    // On screen, only a small line with the publication date and time; the edition's h1 is for screen readers only.
    const dateline =
      '<p class="meta"><time datetime="2026-10-14T19:05:00-03:00">Publicada em 14 de outubro de 2026, às 19:05</time></p>';
    // Both carry the `data-edition` hook, so themes style the dateline the same on either page.
    for (const page of [home, read(out, 'edicoes/2026-10-14.html')]) {
      expect(page).toContain('data-edition="2026-10-14"');
      expect(page).toContain(dateline);
      expect(page).toContain('<h1 id="edicao" class="visually-hidden">');
    }
    // `/edicoes`: each date links once and lists its stories' titles.
    const editions = read(out, 'edicoes.html');
    expect(editions).toContain(
      '<li><a href="/edicoes/2026-10-14"><time datetime="2026-10-14">14 de outubro de 2026</time></a><ul><li>' +
        '<a href="/materias/exemplo-de-materia-linkedia">Exemplo ilustrativo de matéria</a></li></ul></li>',
    );
    expect(editions).not.toContain('matéria(s)');
    // Special content (D-075): listed first under its own heading, then the daily archive under another.
    for (const s of SPECIALS) {
      expect(editions).toContain(`<a href="/especiais/${s.slug}">${s.title}</a>`);
      expect(editions.indexOf(`/especiais/${s.slug}`)).toBeLessThan(editions.indexOf('data-archive'));
    }
    expect(editions).toMatch(/<h2 id="especiais"[^>]*>Conteúdos especiais<\/h2>[\s\S]*<h2 id="por-data"[^>]*>Edições diárias<\/h2>/);
    const special = read(out, 'especiais/governanca-de-ia.html');
    expect(special).toContain('data-article="especial-governanca-de-ia"');
    expect(special).toContain('<title>Governança de IA: como implementar em ambientes corporativos');
    expect(special).toContain('data-ai-note');
    expect(special.match(/<h1[\s>]/g)).toHaveLength(1);
    // Every in-page link lands on an id of the page; every outside link opens without referrer or opener.
    const ids = new Set([...special.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const anchors = [...special.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThanOrEqual(14);
    for (const id of anchors) expect(ids.has(id), id).toBe(true);
    const outside = [...special.matchAll(/<a href="https:[^"]*"([^>]*)>/g)].map((m) => m[1]);
    expect(outside.length).toBeGreaterThan(0);
    for (const attrs of outside) expect(attrs).toContain('rel="noopener noreferrer"');
    const cover = read(out, 'index.html');
    expect(cover).toContain(`<html lang="pt-BR" data-cover="${CURRENT_COVER}">`);
    expect(cover).toContain(`data-cover-art="${CURRENT_COVER}"`); // the page imports the registry's current cover
    expect(cover).toContain('<time datetime="2026-10-14">14 de outubro de 2026</time>');
    expect(cover).toContain('Exemplo ilustrativo de matéria');
    const archive = read(out, 'visual.html');
    expect(archive).not.toContain('data-theme-choice'); // no lab theme: nothing to choose
    for (const c of COVERS) {
      expect(archive).toContain(`<a href="/visual/${c.slug}">${c.title}</a>`);
      expect(read(out, `visual/${c.slug}.html`)).toContain(`data-cover-art="${c.slug}"`);
    }
    expect(read(out, 'sobre.html')).toContain(
      'Edição de <a href="https://portfolio-douglas-alencar.web.app/" rel="author">Douglas Alencar</a>.',
    );
    const about = readFileSync(join(out, 'sobre.html'), 'utf8');
    expect(about).toContain('Texto gerado por IA');
    expect(about).toContain('Pautas escolhidas por um editor humano');
    const article = readFileSync(join(out, 'materias/exemplo-de-materia-linkedia.html'), 'utf8');
    expect(article).toContain('Exemplo ilustrativo de matéria');
    expect(article).toContain('id="fonte-s1"');
    expect(article).toMatch(/<p class="meta" data-ai-note>\s*Texto gerado com IA a partir das fontes abaixo/);
    expect(article.match(/data-ai-note/g)).toHaveLength(1); // one note per article, never two
    expect(article).not.toContain('Textos gerados com IA');
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
    // Code and diagram blocks: every <pre> is focusable (axe scrollable-region-focusable).
    expect(article.match(/<pre tabindex="0">/g)).toHaveLength(2);
    expect(article).not.toMatch(/<pre(?![^>]*\stabindex="0")/);
    expect(escaped).toBeGreaterThan(30);
    expect(existsSync(join(out, 'materias/materia-hostil-2.html'))).toBe(true);
  }, 120_000);

  it('numbers sources by id and cites a captionless diagram', async () => {
    const dir = temp('linkedia-sources-');
    const a = hostileArticle(1);
    const [base] = a.sources;
    a.sources = [
      { ...base, source_id: 's7', title: 'Fonte sete' },
      { ...base, source_id: 's2', title: 'Fonte dois' },
    ];
    a.blocks = [
      { type: 'paragraph', text: 'Parágrafo.', source_ids: ['s2', 's7'] },
      { type: 'diagram', diagram_format: 'mermaid', diagram_spec: 'graph TD; A-->B', alt: 'Diagrama',
        long_description: 'Descrição longa do diagrama sem legenda.', source_ids: ['s7'] },
    ];
    const write = (path, doc) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), JSON.stringify(doc));
    };
    write(`articles/${a.article_id}.json`, a);
    write('editions/2026-10-15.json', {
      schema_version: '1.0.0', edition_date: '2026-10-15', title: 'Edição', article_ids: [a.article_id],
      published_at: '2026-10-15T19:00:00-03:00', timezone: 'America/Sao_Paulo',
    });
    write('tags/catalog.json', { schema_version: '1.0.0', tags: [{ key: 'topic:hostil', kind: 'topic', label: 'Tag' }] });
    expect(validateContent(dir).errors).toEqual([]);
    const html = readFileSync(join(await buildSite(dir), 'materias/materia-hostil-1.html'), 'utf8');
    expect(html).toContain('<li id="fonte-s7" value="7">');
    expect(html).toContain('<li id="fonte-s2" value="2">');
    expect(html).toMatch(/<a href="#fonte-s2" aria-label="Fonte 2">2<\/a>/);
    const diagram = html.slice(html.indexOf('data-block="diagram"'));
    expect(diagram.slice(0, diagram.indexOf('</figure>'))).toMatch(/<figcaption>[\s\S]*href="#fonte-s7"/);
  }, 120_000);

  it('ships three slots with lab themes: pre-paint script, runtime everywhere, switcher on /visual, lazy enhancement', async () => {
    const out = await buildSite(EXAMPLES, FIXTURE_THEMES);
    const pages = htmlFiles(out);
    expect(pages).toHaveLength(12 + COVERS.length);
    for (const page of pages.filter((p) => !isCover(p))) {
      const html = read(out, page);
      expect(html, page).toContain(
        '<html lang="pt-BR" data-theme="lab-2099-w02" data-theme-baseline="minimal-dark" ' +
          'data-theme-previous="lab-2099-w01" data-theme-current="lab-2099-w02">',
      );
      // Exactly one inline script, in <head>: the hashed pre-paint script (firebase.json script-src).
      const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
      expect(inline.map((m) => m[1]), page).toEqual([THEME_INIT_SCRIPT]);
      expect(inline[0].index, page).toBeLessThan(html.indexOf('</head>'));
      expect(html, page).not.toMatch(/<style[\s>]|\sstyle=/);
      expect(html, page).toMatch(/<script type="module" src="\/_astro\/ThemeRuntime[^"]*\.js"><\/script>/);
      expect(html, page).not.toContain('enhance.'); // the enhancement is never preloaded
      expect(html.includes('data-theme-switcher'), page).toBe(page === 'visual.html');
      if (page !== 'visual.html') continue;
      const switcher = html.slice(html.indexOf('<fieldset'), html.indexOf('</fieldset>'));
      expect(switcher, page).toContain('<fieldset data-theme-switcher hidden><legend>Tema visual</legend>');
      expect([...switcher.matchAll(/<input type="radio" name="tema" value="(\w+)"([^>]*)>/g)].map((m) => [m[1], m[2]])).toEqual([
        ['baseline', ' data-theme-title="Minimal Dark"'],
        ['previous', ' data-theme-title="Fixture Light"'],
        ['current', ' checked data-theme-title="Fixture Motion"'],
      ]);
      expect(switcher).toContain('Fixo: Fixture Light</label>');
      expect(switcher).toContain('<p data-theme-status aria-live="polite" class="meta"></p>');
    }
    // Slotted lab styles come after the baseline in the one stylesheet.
    const [css] = assets(out, '.css');
    const styles = read(out, `_astro/${css}`);
    expect(styles.indexOf('lab-2099-w01')).toBeGreaterThan(styles.indexOf('minimal-dark'));
    expect(styles).toContain('lab-2099-w02-pulse');
    // The enhancement is its own chunk, imported only by the runtime; the runtime stays within budget.
    const [enhance] = assets(out, '.js').filter((f) => f.startsWith('enhance.'));
    const [entry] = assets(out, '.js').filter((f) => f.startsWith('ThemeRuntime'));
    expect(read(out, `_astro/${entry}`)).toContain(`import(\`./${enhance}\`)`);
    expect(statSync(join(out, '_astro', entry)).size).toBeLessThanOrEqual(6_000);
  }, 120_000);

  it('disables the previous slot with a single experiment and ships no archived theme', async () => {
    const themes = themesVariant((_, m) => {
      m.previous_theme_id = null;
      m.themes[1].status = 'archived'; // lab-2099-w01 keeps its folder but leaves the slots
    });
    const out = await buildSite(EXAMPLES, themes);
    const html = read(out, 'visual.html');
    expect(html).toContain('<html lang="pt-BR" data-theme="lab-2099-w02" data-theme-baseline="minimal-dark" data-theme-current="lab-2099-w02">');
    expect(html).toContain('<input type="radio" name="tema" value="previous" disabled>Fixo (ainda não há)</label>');
    const styles = assets(out, '.css').map((f) => read(out, `_astro/${f}`)).join('');
    expect(styles).toContain('lab-2099-w02');
    expect(styles).not.toContain('lab-2099-w01');
  }, 120_000);

  it('refuses to build with a theme that styles outside its scope', async () => {
    const themes = themesVariant((dir) => writeFileSync(join(dir, 'lab-2099-w01/theme.css'), 'main { display: none }'));
    await expect(buildSite(EXAMPLES, themes)).rejects.toThrow(/Manifesto de temas inválido[\s\S]*seletor fora do escopo do tema: main/);
  }, 120_000);

  it('renders an empty magazine without editions', async () => {
    const out = await buildSite(temp('linkedia-empty-'));
    expect(htmlFiles(out).sort()).toEqual(
      [
        'index.html',
        'revista.html',
        'visual.html',
        ...COVERS.map((c) => `visual/${c.slug}.html`),
        'edicoes.html',
        'categorias/engenharia-de-ia.html',
        'categorias/lideranca-de-ia.html',
        'categorias/conhecimento-de-ia.html',
        'especiais/governanca-de-ia.html',
        'sobre.html',
        '404.html',
      ].sort(),
    );
    expect(readFileSync(join(out, 'revista.html'), 'utf8')).toContain('Nenhuma edição publicada ainda.');
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('Nenhuma edição publicada ainda.');
  }, 120_000);
});
