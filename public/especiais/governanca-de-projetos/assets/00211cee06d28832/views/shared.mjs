import { html, raw } from '../html.mjs';
import { lines, sources, relatedGovernance } from '../content.mjs';

export function lineFor(station) { return lines.find(l => l.id === station.line); }
export const stationStates = {
  pending: { label: 'Pendente', glyph: '' },
  partial: { label: 'Em andamento', glyph: '◐' },
  verified: { label: 'Evidências completas', glyph: '✓' },
  na: { label: 'Exceção', glyph: '–' },
  invalid: { label: 'Registro inválido', glyph: '!' }
};
export function sourceLinks(ids = []) { return ids.map(id => sources.find(s => s.id === id)).filter(Boolean).map(s => s.url ? html`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name} ↗</a>` : html`<span>${s.name}</span>`).join(''); }
export function relatedLink(id) { const related = relatedGovernance[id]; return related?.url ? html`<a class="button primary" href="${related.url}">Aprofundar em ${related.name} ↗</a>` : ''; }
function info(id, text, label = 'Mais informações') { return html`<span class="info-wrap">\
<button class="info-button" aria-label="${label}" aria-describedby="${id}" aria-expanded="false">i</button><span class="tooltip" role="tooltip" id="${id}">${text}</span></span>`; }
export function top(title, text, kicker) { return html`<div class="section-heading"><div><p class="section-kicker">${kicker}</p><h2>${title}</h2></div><p>${text}</p></div>`; }
export function summaryMarkup() {
  return html`<section class="review-summary" aria-label="Resumo da revisão">\
<div class="coverage-block"><span class="section-kicker">COBERTURA VERIFICADA ${raw(info('score-info', 'Critérios com referência, revisor e data válidos divididos pelos aplicáveis até o marco. Exceções aceitas saem do denominador. Não estima chance de sucesso.'))}</span>\
<div class="coverage-number" id="summary-percent">\
</div>\
<progress class="coverage-track" id="coverage-bar" value="0" max="100" aria-hidden="true"></progress>\
</div>\
<div class="summary-details"><strong id="summary-outcome"></strong>\
<p id="summary-count">\
</p>\
<p id="summary-blockers">\
</p><small>Autoavaliação declaratória. Referências não são auditadas pelo site.</small>\
</div>\
<div class="summary-actions">\
<button class="button" data-action="export">Exportar JSON <span aria-hidden="true">↓</span>\
</button>\
<button class="text-button" data-action="report">Baixar resumo .md</button>\
<button class="text-button" data-action="import">Importar revisão</button>\
</div>\
</section>`;
}
