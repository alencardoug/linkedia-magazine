import { html, raw } from '../html.mjs';
import { lines, phases } from '../content.mjs';
import { activeLines, evaluate, routeStations, stationStatus } from '../domain.mjs';
import { lineFor, stationStates, summaryMarkup, top } from './shared.mjs';

export function checklistMarkup(state, { checkLine, checkFilter, checkQuery }) {
  return top('O que falta para avançar?', 'Revise um projeto por vez. Registre referências aos artefatos; mantenha o conteúdo sensível no repositório institucional.', '02 / VERIFICAR PRONTIDÃO') +
    html`<div class="project-fields">\
<label>Nome do projeto<input id="project-name" maxlength="200" placeholder="Ex.: Plataforma de navegação" value="${state.project.name}">\
</label>\
<label>Contexto e justificativa da rota<textarea id="project-context" rows="2" maxlength="4000" placeholder="Objetivo, criticidade e por que cada frente se aplica…">${state.project.context}</textarea>\
</label>\
</div>` + summaryMarkup() +
    html`<div class="checklist-toolbar">\
<label class="search-field"><span aria-hidden="true">⌕</span>\
<input type="search" id="check-search" placeholder="Buscar estação, critério ou artefato…" value="${checkQuery}" aria-label="Buscar na avaliação">\
</label>\
<label class="sr-only" for="check-line">Filtrar por frente</label><select id="check-line">\
<option value="all">Todas as frentes</option>${raw(lines.filter(l => activeLines(state.project).includes(l.id)).map(l => html`<option value="${l.id}"${raw(l.id === checkLine ? ' selected' : '')}>${l.name}</option>`).join(''))}</select>\
<label class="sr-only" for="check-filter">Filtrar por situação</label><select id="check-filter">\
<option value="all"${raw(checkFilter === 'all' ? ' selected' : '')}>Todas as situações</option>\
<option value="open"${raw(checkFilter === 'open' ? ' selected' : '')}>Com lacunas</option>\
<option value="blockers"${raw(checkFilter === 'blockers' ? ' selected' : '')}>Com bloqueadores abertos</option>\
<option value="verified"${raw(checkFilter === 'verified' ? ' selected' : '')}>Evidências completas</option></select>\
</div>\
<div id="station-list">\
</div>\
<div class="local-note">\
<p id="storage-note">\
</p>\
<button class="text-button danger-text" data-action="reset">Limpar avaliação local</button>\
</div>`;
}
export function stationListMarkup(state, { checkLine, checkFilter, checkQuery }) {
  const result = evaluate(state);
  const filtered = routeStations(state.project).filter(s => {
    const records = result.items.filter(i => i.station.id === s.id);
    const q = `${s.title} ${s.summary} ${s.artifacts.join(' ')} ${s.controls.map(c => c.question).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = checkQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return (checkLine === 'all' || s.line === checkLine) && q.includes(query) && (checkFilter === 'all' || (checkFilter === 'verified' ? stationStatus(s, state) === 'verified' : records.some(i => !['verified', 'na'].includes(i.status) && (checkFilter !== 'blockers' || i.control.critical))));
  });
  return html`<p class="result-count" role="status">${filtered.length} estações nesta seleção</p>` + phases.map(p => {
    const group = filtered.filter(s => s.phase === p.id); if (!group.length) return '';
    return html`<section class="check-phase">\
<div class="check-phase-label"><span>0${p.id}</span>\
<h3>${p.name}</h3>\
<button class="inline-button" data-phase="${p.id}">${p.gate} ↗</button>\
</div>\
<div class="station-cards">${raw(group.map(s => {
      const l = lineFor(s); const records = result.items.filter(i => i.station.id === s.id); const count = records.filter(i => ['verified', 'na'].includes(i.status)).length;
      const status = stationStatus(s, state);
      return html`<button class="station-card line-${l.id}" data-station="${s.id}"><span class="station-card-line"><b>${l.code}</b>${l.name}</span><strong>${s.title} <span aria-hidden="true">↗</span></strong>\
<p>${s.summary}</p><span class="station-card-bottom">${count}/${records.length} critérios resolvidos <span class="station-status">${stationStates[status].label}</span></span>\
</button>`;
    }).join(''))}</div>\
</section>`;
  }).join('') + (!filtered.length ? '<div class="empty-result"><h3>Nenhuma estação nesta seleção.</h3><p>Altere a busca, os filtros ou o marco da revisão.</p></div>' : '');
}
