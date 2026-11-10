import { html, raw } from './html.mjs';
import { stations, phases, promptSuffix } from './content.mjs';
import { guides, templates } from './library.mjs';
import { activeLines, assessControl, checksFor, evaluate, routeStations, stationStatus, today } from './domain.mjs';
import { lineFor, relatedLink, sourceLinks } from './views/shared.mjs';

const detail = (kicker, body) => ({ kicker, body });

export function stationDetail(id, state) {
  const s = stations.find(s => s.id === id); if (!s) return;
  const l = lineFor(s); const active = activeLines(state.project).includes(s.line);
  const deps = s.dependsOn.map(id => stations.find(s => s.id === id)).filter(d => activeLines(state.project).includes(d.line));
  const checks = checksFor(s, state.project);
  return detail(`${l.code} / ${l.name} · 0${s.phase} ${phases[s.phase - 1].name}`, html`<div class="station-detail line-${l.id}">\
<p class="section-kicker">ESTAÇÃO ${s.id.toUpperCase()}</p>\
<h2 id="dialog-title">${s.title}</h2>\
<p class="dialog-lead">${s.summary}</p>${raw(!active ? '<p class="notice">Esta frente está fora da sua rota. Você pode consultar o conteúdo; os critérios só entram na avaliação quando a frente é ativada.</p>' : s.phase > state.project.stage ? '<p class="notice">Esta estação está depois do marco escolhido. As respostas serão preservadas e entrarão no cálculo quando o marco for ampliado.</p>' : '')}<p>${s.why}</p>\
<dl class="responsibility">\
<div><dt>Quem conduz</dt><dd>${s.owner}</dd>\
</div>\
<div><dt>Quem aprova</dt><dd>${s.approver}</dd>\
</div>\
<div><dt>Quando revisar</dt><dd>${s.when}</dd>\
</div>\
</dl>\
<h3>O que precisa estar comprovado</h3>\
<p class="dialog-help">${checks.length} critérios neste rigor. “Verificado” exige referência, revisor e data. Bloqueadores não aceitam dispensa.</p>\
<div class="controls">${raw(checks.map(c => controlMarkup(c, state)).join(''))}</div>\
<h3>Artefatos de referência</h3>\
<ul class="artifact-list">${raw(s.artifacts.map(a => html`<li>${a}</li>`).join(''))}</ul>\
<details class="detail-section">\
<summary>Exemplo aplicado <span>+</span>\
</summary>\
<p>${s.example}</p>\
</details>\
<details class="detail-section">\
<summary>Armadilhas para evitar <span>+</span>\
</summary>\
<ul>${raw(s.pitfalls.map(p => html`<li>${p}</li>`).join(''))}</ul>\
</details>\
<details class="detail-section">\
<summary>Prompt para aprofundar com IA <span>+</span>\
</summary>\
<p class="dialog-help">Use contexto anonimizado. Peça fontes primárias atuais e revise a resposta com o responsável.</p>\
<blockquote id="station-prompt">${s.prompt} ${promptSuffix}</blockquote>\
<button class="button" data-copy="prompt">Copiar prompt</button>\
</details>${raw(deps.length ? html`<details class="detail-section">\
<summary>Conexões e dependências <span>+</span>\
</summary>\
<p>Revise estas estações antes da decisão. O trabalho pode ocorrer em paralelo.</p>\
<div class="related-links">${raw(deps.map(d => html`<button class="related-link" data-station="${d.id}">${d.title}<small>${stationStatus(d, state) === 'verified' ? 'Evidências completas' : 'Revisar dependência'} ↗</small>\
</button>`).join(''))}</div>\
</details>` : '')}<h3>Continue a partir daqui</h3>\
<div class="related-links">${raw(s.guides.map(id => { const g = guides.find(g => g.id === id); return g ? html`<button class="related-link" data-guide="${id}">${g.title} <span>Guia ↗</span></button>` : ''; }).join(''))}${raw(s.templates.map(id => { const t = templates.find(t => t.id === id); return t ? html`<button class="related-link" data-template="${id}">${t.title} <span>Modelo ↗</span></button>` : ''; }).join(''))}</div>\
<div class="dialog-sources">${raw(sourceLinks(s.sources))}</div>\
<p class="save-indicator">Respostas locais. Exporte JSON para manter um backup.</p>\
<button class="button" data-share="estacao=${s.id}">Copiar link desta estação ↗</button>\
</div>`);
}
function controlMarkup(c, state) {
  const a = state.answers[c.id] || { status: 'pending' }; const assessed = assessControl(c, a);
  return html`<section class="control" data-control="${c.id}">\
<div class="control-heading"><span class="control-id">${c.id.toUpperCase()}</span>${raw(c.critical ? '<span class="critical-label">BLOQUEADOR</span>' : '')}</div>\
<h4>${c.question}</h4>\
<p class="evidence-expected"><strong>Evidência esperada</strong> ${c.evidence}</p>\
<label class="answer-label">Situação<select data-answer="${c.id}" data-field="status">\
<option value="pending"${raw(a.status === 'pending' ? ' selected' : '')}>Pendente de revisão</option>\
<option value="partial"${raw(a.status === 'partial' ? ' selected' : '')}>Parcial / em andamento</option>\
<option value="verified"${raw(a.status === 'verified' ? ' selected' : '')}>Verificado com evidência</option>${raw(!c.critical ? html`<option value="na"${raw(a.status === 'na' ? ' selected' : '')}>Não aplicável (justificar)</option>` : '')}</select>\
</label>\
<p class="control-feedback" data-feedback="${c.id}">${assessed.reason || (assessed.status === 'verified' ? 'Registro completo. Confirme o conteúdo da evidência com o revisor.' : assessed.status === 'na' ? 'Exceção registrada; fora do denominador.' : '')}</p>\
<details class="evidence-details"${raw(['verified', 'na'].includes(a.status) ? ' open' : '')}>\
<summary>Referência, revisão e observações</summary>\
<div class="answer-fields">\
<label>Referência da evidência<input type="text" maxlength="4000" data-answer="${c.id}" data-field="evidence" value="${a.evidence}" placeholder="URL, issue ou ID do artefato oficial">\
</label>\
<label>Revisor / responsável<input type="text" maxlength="4000" data-answer="${c.id}" data-field="reviewer" value="${a.reviewer}" placeholder="Quem verificou">\
</label>\
<div class="date-fields">\
<label>Data da revisão<input type="date" max="${today()}" data-answer="${c.id}" data-field="reviewedOn" value="${a.reviewedOn}">\
</label>\
<label>Válido até (opcional)<input type="date" data-answer="${c.id}" data-field="expiresOn" value="${a.expiresOn}">\
</label>\
</div>${raw(!c.critical ? html`<label>Justificativa se não aplicável<textarea rows="2" maxlength="4000" data-answer="${c.id}" data-field="reason">${a.reason}</textarea>\
</label>` : '')}<label>Observações / próxima ação<textarea rows="2" maxlength="4000" data-answer="${c.id}" data-field="notes">${a.notes}</textarea>\
</label>\
</div>\
</details>\
</section>`;
}
export function guideDetail(id) {
  const g = guides.find(g => g.id === id); if (!g) return;
  return detail(g.eyebrow, html`<article class="guide-detail">\
<h2 id="dialog-title">${g.title}</h2>\
<p class="dialog-lead">${g.intro}</p>${raw(g.sections.map(([title, body]) => html`<section><h3>${title}</h3><p>${body}</p></section>`).join(''))}${raw(relatedLink(id))}<div class="dialog-sources">${raw(sourceLinks(g.sources))}</div>\
<button class="button" data-share="guia=${id}">Copiar link deste guia ↗</button>\
</article>`);
}
export function templateDetail(id) {
  const t = templates.find(t => t.id === id); if (!t) return;
  return detail('MODELO EDITÁVEL · MARKDOWN', html`<h2 id="dialog-title">${t.title}</h2>\
<p class="dialog-lead">${t.description}</p>\
<div class="template-actions">\
<button class="button primary" data-download-template="${t.id}">Baixar modelo .md ↓</button>\
<button class="button" data-copy-template="${t.id}">Copiar conteúdo</button>\
</div><pre class="template-preview">${t.body}</pre>`);
}
export function phaseDetail(id, state) {
  const p = phases.find(p => p.id === Number(id)); if (!p) return;
  const r = evaluate(state, p.id);
  return detail(`MARCO 0${p.id} · ${p.name}`, html`<p class="section-kicker">DECISÃO DE GOVERNANÇA</p>\
<h2 id="dialog-title">${p.gate}</h2>\
<p class="dialog-lead">${p.decision}</p>\
<dl class="responsibility">\
<div><dt>Autoridade sugerida</dt><dd>${p.approver}</dd>\
</div>\
<div><dt>Se não passar</dt><dd>${p.returnTo}</dd>\
</div>\
</dl>\
<div class="phase-result"><strong>${r.outcome}</strong>\
<p>${r.verified}/${r.applicable} critérios verificados · ${r.excluded} exceções · ${r.blockers.length} bloqueadores a verificar.</p><small>A revisão acumula as fases anteriores. Evidências completas ainda exigem decisão humana.</small>\
</div>\
<h3>Estações deste marco</h3>\
<div class="related-links">${raw(routeStations(state.project, p.id).filter(s => s.phase === p.id).map(s => html`<button class="related-link" data-station="${s.id}">${s.title}<span>${lineFor(s).code} ↗</span></button>`).join(''))}</div>${raw(r.blockers.length ? html`<details class="detail-section">\
<summary>Bloqueadores até este marco (${r.blockers.length}) <span>+</span>\
</summary>\
<div class="related-links">${raw(r.blockers.map(i => html`<button class="related-link" data-station="${i.station.id}">${i.control.question}<small>${i.control.id.toUpperCase()} ↗</small></button>`).join(''))}</div>\
</details>` : '')}<div class="template-actions">\
<button class="button" data-template="liberacao">Abrir modelo de decisão ↗</button>\
</div>`);
}
