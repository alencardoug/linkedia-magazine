import { html, raw } from '../html.mjs';
import { guides, templates } from '../library.mjs';
import { top } from './shared.mjs';

export function libraryMarkup(libraryQuery) {
  return top('Profundidade, quando precisar.', 'Guias curtos para orientar decisões e modelos editáveis para colocar a governança em prática.', '03 / BIBLIOTECA PRÁTICA') +
    html`<label class="search-field library-search"><span aria-hidden="true">⌕</span>\
<input type="search" id="library-search" placeholder="Buscar guia ou modelo…" aria-label="Buscar na biblioteca" value="${libraryQuery}">\
</label>\
<div id="library-results">\
</div>`;
}
export function libraryResultsMarkup(libraryQuery) {
  const normalized = v => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = item => normalized(`${item.title} ${item.intro || item.description}`).includes(normalized(libraryQuery));
  const selectedGuides = guides.filter(match), selectedTemplates = templates.filter(match);
  return html`<h3 class="library-heading">Guias de aprofundamento <span>${selectedGuides.length}</span>\
</h3>\
<div class="guide-grid">${raw(selectedGuides.map((g, i) => html`<button class="guide-card" data-guide="${g.id}"><span class="section-kicker">${g.eyebrow}</span><span class="guide-card-number">${String(i + 1).padStart(2, '0')}</span>\
<h4>${g.title}</h4>\
<p>${g.intro}</p><span class="inline-link">Ler o guia <span aria-hidden="true">↗</span></span>\
</button>`).join(''))}</div>\
<h3 class="library-heading">Modelos para trabalhar <span>${selectedTemplates.length}</span>\
</h3>\
<p class="library-caption">Abra, adapte e baixe em Markdown. Os campos em branco precisam de decisão e evidência do seu projeto.</p>\
<div class="template-grid">${raw(selectedTemplates.map(t => html`<button class="template-card" data-template="${t.id}"><span class="document-icon" aria-hidden="true">≡</span><span><strong>${t.title}</strong><small>${t.description}</small></span><span aria-hidden="true">↗</span>\
</button>`).join(''))}</div>${raw(!selectedGuides.length && !selectedTemplates.length ? '<p class="empty-result" role="status">Nenhum resultado. Tente outro termo.</p>' : '')}<div class="print-link">\
<p>Prefere ler ou imprimir tudo de uma vez?</p><a class="button" href="/especiais/governanca-de-projetos/guia-completo">Versão completa de leitura ↗</a><a class="text-button" href="/especiais/governanca-de-projetos/conteudo.json" download>Baixar conteúdo estruturado JSON ↓</a>\
</div>`;
}
