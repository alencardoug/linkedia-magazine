// Static build (1B-01): every route is emitted from a content dir, and model-produced text is always escaped.
// Reading modes (V2-06): every reading page loads the blocking same-origin bootstrap and has the mode button; the
// retired theme system (slots, switcher, lab themes) leaves nothing behind.
// Covers (3-01): `/` and `/visual/<slug>` are cover pages with their own shell and code; reading pages load none of it.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'astro';
import { afterAll, describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/validate-content.mjs';
import { COVERS, CURRENT_COVER } from '../src/covers/registry';
import { SPECIALS, specialHref } from '../src/lib/specials';

const ROOT = resolve(import.meta.dirname, '..');
// The six editorias (D-079, D-084): one category page each, filled or not.
const CATEGORY_PAGES = ['ia-na-pratica', 'lideranca-de-ia', 'marketing', 'saude', 'china', 'novidades-de-ia'].map(
  (slug) => `categorias/${slug}.html`,
);
const EXAMPLES = join(ROOT, 'content/examples');
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

async function buildSite(contentDir) {
  const outDir = temp('linkedia-dist-', OUT_PARENT);
  const env = { LINKEDIA_CONTENT_DIR: contentDir };
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
// Art-directed specials (3-22): Astro pages on their own shell (SpecialLayout.astro).
const ART_DIRECTED = SPECIALS.filter((s) => s.artDirected).map((s) => `especiais/${s.slug}.html`);

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
        ...CATEGORY_PAGES,
        'especiais/governanca-de-ia.html',
        'especiais/perguntar-ao-banco.html',
        'especiais/dez-layouts-governanca-de-ia.html',
        'sobre.html',
        '404.html',
      ].sort(),
    );
    // The editor is named on /sobre only; the AI note is in the footer of /revista only, each article carries its own
    // note instead (owner, 2026-10-19). No inline code or third-party file anywhere. Reading pages: the mode bootstrap first in
    // <head>, then bundled modules only; cover pages: their own shell and only their own cover's script, within the budgets.
    const AI_NOTE_PAGES = ['revista.html'];
    for (const page of htmlFiles(out)) {
      const html = readFileSync(join(out, page), 'utf8');
      expect(html.includes('rel="author"'), page).toBe(page === 'sobre.html');
      expect(html.includes('Textos gerados com IA'), page).toBe(AI_NOTE_PAGES.includes(page));
      expect(html.includes('data-site-footer'), page).toBe(AI_NOTE_PAGES.includes(page));
      expect(html, page).not.toMatch(/<link[^>]+href="https?:/); // no third-party stylesheet or font
      if (ART_DIRECTED.includes(page)) {
        // Its own shell (3-22): no weekly theme or switcher, then only the page's own bundled files; no inline code.
        // The AI guide (two schemes) first loads one classic same-origin script in <head> that applies the stored
        // light/dark pick before the stylesheet; a one-scheme page (the NL→SQL special, dark) has none.
        const scheme = page === 'especiais/governanca-de-ia.html';
        expect(html, page).toMatch(
          scheme
            ? /^<!DOCTYPE html><html lang="pt-BR" data-special-layout><head><meta charset="utf-8"><script src="\/especiais\/governanca-de-ia\/esquema\.js"><\/script>/
            : /^<!DOCTYPE html><html lang="pt-BR" data-special-layout><head><meta charset="utf-8"><meta name="viewport"/,
        );
        expect(html, page).toContain(`<meta name="color-scheme" content="${scheme ? 'light dark' : 'dark'}">`);
        expect(html.includes('data-scheme-toggle'), page).toBe(scheme);
        expect(html, page).not.toContain('data-theme');
        expect(html, page).not.toMatch(/<style[\s>]|\sstyle=/);
        const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
        expect(scripts, page).toEqual([
          ...(scheme ? [' src="/especiais/governanca-de-ia/esquema.js"'] : []),
          expect.stringMatching(/^ type="module" src="\/_astro\/[\w.-]+\.js"$/),
        ]);
        expect(existsSync(join(out, 'especiais/governanca-de-ia/esquema.js')), page).toBe(true);
        expect(html, page).toContain('<a href="/revista" class="sl-brand" data-brand>');
        expect(html, page).toContain('<a href="/visual">Visual</a>');
        expect(html, page).not.toMatch(/[\p{L}.,;:]<a\s/u);
        expect(html, page).not.toMatch(/<pre(?![^>]*\stabindex="0")/);
        // Budgets (gzipped): page CSS ≤ 30 KB, page JS ≤ 12 KB; self-hosted fonts ≤ 300 KB in all, every one preloaded.
        const gz = (files) => files.reduce((n, f) => n + gzipSync(readFileSync(join(out, f))).length, 0);
        const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+)"/g)].map((m) => m[1]);
        expect(gz(styles), page).toBeLessThanOrEqual(30 * 1024);
        expect(gz([scripts.at(-1).match(/src="\/([^"]+)"/)[1]]), page).toBeLessThanOrEqual(12 * 1024);
        const css = styles.map((f) => readFileSync(join(out, f), 'utf8')).join('');
        const fonts = [...new Set([...css.matchAll(/url\((\/_astro\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
        expect(fonts.length, page).toBe(scheme ? 4 : 2);
        expect(fonts.reduce((n, f) => n + statSync(join(out, f)).size, 0), page).toBeLessThanOrEqual(300 * 1024);
        const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1]);
        expect(preloads.length, page).toBe(2);
        for (const f of preloads) expect(fonts, page).toContain(f);
        continue;
      }
      // The CSP (firebase.json) allows only same-origin files: no inline script, style element or style attribute.
      expect(html, page).not.toMatch(/<script(?![^>]*\ssrc="\/(?:_astro\/|modo\.js"))[^>]*>/);
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
      // Reading modes (V2-06): the classic bootstrap runs first, blocking (no async/defer/module), before any
      // stylesheet; then only bundled module scripts. The button ships hidden (no JS: system mode, no control).
      expect(html, page).toMatch(/^<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><script src="\/modo\.js"><\/script><meta name="viewport"/);
      expect(html, page).toContain('<meta name="color-scheme" content="light dark">');
      const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
      expect(scripts[0], page).toBe(' src="/modo.js"');
      for (const s of scripts.slice(1)) expect(s, page).toMatch(/^ type="module" src="\/_astro\/[\w.-]+\.js"$/);
      expect(scripts.length, page).toBeGreaterThan(1);
      expect(html, page).toContain('<button type="button" data-mode-toggle aria-describedby="modo-proximo" hidden>');
      expect(html, page).toContain('<span id="modo-proximo" class="visually-hidden" data-mode-next></span>');
      expect(html, page).toContain('<span class="visually-hidden" aria-live="polite" data-mode-status></span>');
      expect(html, page).not.toContain('data-theme');
      expect(html, page).not.toContain('Cover.astro'); // no cover code on reading pages
      expect(html, page).toContain('<a href="/revista" data-brand>');
      expect(html, page).toContain('<a href="/visual">Visual</a>');
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
      expect(editions).toContain(`<a href="${specialHref(s)}">${s.title}</a>`);
      expect(editions.indexOf(specialHref(s))).toBeLessThan(editions.indexOf('data-archive'));
    }
    expect(editions).toMatch(/<h2 id="especiais"[^>]*>Conteúdos especiais<\/h2>[\s\S]*<h2 id="por-data"[^>]*>Edições diárias<\/h2>/);
    const special = read(out, 'especiais/governanca-de-ia.html');
    expect(special).toContain('data-article="especial-governanca-de-ia"');
    expect(special).toContain('<title>Guia Governança de IA: como implementar em ambientes corporativos');
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
    // The project guide (owner, 2026-11-10): right below the AI guide, linked at its own site (V2-02b). The magazine
    // keeps only the old snapshot's hashed modules and CSS (open or cached old pages), no page and no JSON.
    const ai = editions.indexOf('/especiais/governanca-de-ia"');
    const projects = editions.indexOf('"https://governaproj.web.app/"');
    expect(projects).toBeGreaterThan(ai);
    expect(projects).toBeLessThan(editions.indexOf('/especiais/dez-layouts-governanca-de-ia"'));
    expect(editions).not.toContain('href="/especiais/governanca-de-projetos');
    expect(existsSync(join(out, 'especiais/governanca-de-projetos.html'))).toBe(false);
    const legacy = readdirSync(join(out, 'especiais/governanca-de-projetos'), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name).slice(out.length + 1));
    expect(legacy.length).toBeGreaterThan(0);
    for (const f of legacy) expect(f).toMatch(/^especiais\/governanca-de-projetos\/assets\/00211cee06d28832\/[\w/-]+\.(?:m?js|css)$/);
    // The NL→SQL special (owner, 2026-11-11): below the two guides, before the showcase; one h1, every in-page link
    // lands, every outside link without referrer or opener, the AI note.
    const nl = editions.indexOf('/especiais/perguntar-ao-banco"');
    expect(nl).toBeGreaterThan(projects);
    expect(nl).toBeLessThan(editions.indexOf('/especiais/dez-layouts-governanca-de-ia"'));
    const nlsql = read(out, 'especiais/perguntar-ao-banco.html');
    expect(nlsql).toContain('data-article="especial-perguntar-ao-banco"');
    expect(nlsql.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(nlsql).toContain('data-ai-note');
    const nlIds = new Set([...nlsql.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const nlAnchors = [...nlsql.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(nlAnchors.length).toBeGreaterThanOrEqual(18);
    for (const id of nlAnchors) expect(nlIds.has(id), id).toBe(true);
    const nlOutside = [...nlsql.matchAll(/<a href="https:[^"]*"([^>]*)>/g)].map((m) => m[1]);
    expect(nlOutside.length).toBeGreaterThanOrEqual(20);
    for (const attrs of nlOutside) expect(attrs).toContain('rel="noopener noreferrer"');
    for (const id of ['gcp', 'aws', 'azure', 'databricks', 'snowflake', 'claude-code', 'codex', 'gemini-cli']) {
      expect(nlsql, id).toContain(`<h4 id="${id}">`);
    }
    // The sketch showcase (3-23, D-077): listed right after the guide; one desktop and one phone shot per sketch, small.
    expect(editions.indexOf('/especiais/dez-layouts-governanca-de-ia')).toBeGreaterThan(editions.indexOf('/especiais/governanca-de-ia"'));
    const layouts = read(out, 'especiais/dez-layouts-governanca-de-ia.html');
    expect(layouts.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(layouts).toContain('href="/especiais/governanca-de-ia"');
    const imgs = [...layouts.matchAll(/<img[^>]*data-device="(desktop|celular)"[^>]*src="([^"]+\.webp)"/g)];
    expect(imgs.filter((m) => m[1] === 'desktop')).toHaveLength(10);
    expect(imgs.filter((m) => m[1] === 'celular')).toHaveLength(10);
    const bytes = imgs.map((m) => statSync(join(out, m[2])).size);
    expect(Math.max(...bytes)).toBeLessThanOrEqual(100 * 1024);
    expect(bytes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    const cover = read(out, 'index.html');
    expect(cover).toContain(`<html lang="pt-BR" data-cover="${CURRENT_COVER}">`);
    expect(cover).toContain(`data-cover-art="${CURRENT_COVER}"`); // the page imports the registry's current cover
    expect(cover).toContain('<time datetime="2026-10-14">14 de outubro de 2026</time>');
    expect(cover).toContain('Exemplo ilustrativo de matéria');
    const archive = read(out, 'visual.html');
    expect(archive).not.toMatch(/data-theme|Tema de leitura/); // the gallery only (V2-06)
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

  it('ships the reading modes and nothing of the retired theme system', async () => {
    const out = await buildSite(EXAMPLES);
    // The bootstrap is the public file, byte for byte; covers and specials never load it (cover art keeps its palette).
    expect(read(out, 'modo.js')).toBe(readFileSync(join(ROOT, 'public/modo.js'), 'utf8'));
    for (const page of htmlFiles(out).filter((p) => isCover(p) || ART_DIRECTED.includes(p))) {
      expect(read(out, page), page).not.toContain('/modo.js');
      expect(read(out, page), page).not.toContain('data-mode-toggle');
    }
    // One stylesheet (D-085): black = the base (minimal-dark, #111214), only on a pick; light = Broadsheet and
    // dark = Singularidade, each on the explicit pick and, without a pick, on the system's scheme (no JS needed).
    const css = assets(out, '.css').map((f) => read(out, `_astro/${f}`)).join('');
    expect(css).not.toContain('@mode');
    expect(css).toMatch(/:root\{color-scheme:dark;--bg:#111214/);
    expect(css).toMatch(/:root\[data-mode=['"]?light['"]?\]\{color-scheme:light;--bg:#f5f0e6/);
    expect(css).toMatch(/:root\[data-mode=['"]?dark['"]?\]\{color-scheme:dark;--bg:#0a0d26/);
    expect(css).toMatch(/@media \(prefers-color-scheme: ?light\)\{:root:not\(\[data-mode\]\)\{color-scheme:light;--bg:#f5f0e6/);
    expect(css).toMatch(/@media \(prefers-color-scheme: ?dark\)\{:root:not\(\[data-mode\]\)\{color-scheme:dark;--bg:#0a0d26/);
    expect(css).not.toMatch(/data-mode=['"]?black|prefers-color-scheme[^{]*\{[^}]*#111214/); // black is never automatic
    expect(css).not.toMatch(/lab-20\d\d|data-theme/);
    // The button's module stays small and never ships the old runtime.
    const js = assets(out, '.js').map((f) => read(out, `_astro/${f}`));
    expect(js.join('')).not.toMatch(/data-theme|enhance\.|ThemeRuntime/);
    const mode = js.filter((code) => code.includes('linkedia:modo:v1'));
    expect(mode).toHaveLength(1);
    expect(gzipSync(mode[0]).length).toBeLessThanOrEqual(2 * 1024);
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
        ...CATEGORY_PAGES,
        'especiais/governanca-de-ia.html',
        'especiais/perguntar-ao-banco.html',
        'especiais/dez-layouts-governanca-de-ia.html',
        'sobre.html',
        '404.html',
      ].sort(),
    );
    expect(readFileSync(join(out, 'revista.html'), 'utf8')).toContain('Nenhuma edição publicada ainda.');
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('Nenhuma edição publicada ainda.');
  }, 120_000);
});
