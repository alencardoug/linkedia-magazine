import { html, raw } from '../html.mjs';
import { stations, lines, phases, mapLayout } from '../content.mjs';
import { activeLines, stationStatus } from '../domain.mjs';
import { lineFor, stationStates, summaryMarkup, top } from './shared.mjs';

export function mapStationLabel(station, status, project) {
  const scope = !activeLines(project).includes(station.line) ? ' Fora da rota.' :
    station.phase > project.stage ? ' Depois do marco escolhido.' : '';
  return `${station.title}. ${lineFor(station).name}. Marco ${station.phase}. ${stationStates[status].label}.${scope} Abrir critérios.`;
}
export function mapMarkup(state) {
  const active = activeLines(state.project);
  const xpos = phase => 220 + (phase - 1) * 150;
  const ypos = line => 106 + lines.findIndex(l => l.id === line) * 80;
  const firstY = ypos(lines[0].id);
  const lastY = ypos(lines.at(-1).id);
  const reviewX = xpos(mapLayout.integratedReview);
  const decisionX = xpos(mapLayout.releaseDecision);
  const decision = phases.find(p => p.id === mapLayout.releaseDecision);
  const branchPaths = mapLayout.branches.map(({ from, to, shape }) => {
    const [fromLine, fromPhase] = from.split('@');
    const [toLine, toPhase] = to.split('@');
    const x = xpos(Number(fromPhase));
    const endX = xpos(Number(toPhase));
    const y = ypos(fromLine);
    const endY = ypos(toLine);
    const direction = Math.sign(endY - y);
    const xAt = fraction => Math.round(x + (endX - x) * fraction);
    const yAt = fraction => Math.round(y + (endY - y) * fraction);
    const turn = Math.min(35, Math.abs(endY - y) / 2) * direction;
    const path = shape === 'vertical'
      ? `M${x} ${y}H${xAt(1 / 6)}Q${xAt(.4)} ${y} ${xAt(.4)} ${y + turn}V${endY - turn}Q${xAt(.4)} ${endY} ${xAt(.63)} ${endY}H${endX}`
      : `M${x} ${y}H${xAt(.15)}Q${xAt(1 / 3)} ${y} ${xAt(.47)} ${yAt(.35)}L${xAt(.6)} ${yAt(.69)}Q${xAt(.72)} ${endY} ${xAt(.89)} ${endY}H${endX}`;
    return { toLine, path };
  });
  const svg = html`<svg class="metro" viewBox="0 0 1250 570" aria-label="Mapa de governança com ${lines.length} vias e ${phases.length} marcos. Selecione uma estação para abrir os critérios." role="group">
    <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.65" class="map-grid-dot"/></pattern></defs>\
<rect width="1250" height="570" fill="url(#grid)"/>
    ${raw(phases.map(p => html`<text x="${xpos(p.id)}" y="28" class="phase-number" text-anchor="middle">0${p.id}</text>\
<text x="${xpos(p.id)}" y="48" class="phase-name" text-anchor="middle">${p.name}</text>${raw(p === decision ? html`<rect x="${decisionX - 58}" y="${firstY - 43}" width="116" height="${lastY - firstY + 82}" rx="16" class="map-decision-band" opacity=".65"/>` : '')}`).join(''))}
    <path d="M${reviewX} ${firstY}V${lastY}" fill="none" class="map-transfer-edge" stroke-width="20" opacity=".6"/>\
<path d="M${reviewX} ${firstY}V${lastY}" fill="none" class="map-transfer-core" stroke-width="12"/>
    ${raw(lines.map(l => {
      const route = stations.filter(s => s.line === l.id); const y = ypos(l.id); const first = xpos(route[0].phase); const last = xpos(route.at(-1).phase);
      const dim = !active.includes(l.id) ? ' inactive' : '';
      const branches = branchPaths.filter(branch => branch.toLine === l.id);
      return html`<g class="metro-route line-${l.id}${dim}">${raw(branches.map(({ path }) => html`<path d="${path}" class="branch-path"/>`).join(''))}<path d="M${first} ${y}H${last + 40}" class="route-path"/>\
<rect x="20" y="${y - 13}" width="26" height="26" rx="6" class="line-badge"/>\
<text x="33" y="${y + 5}" text-anchor="middle" class="line-code">${l.code}</text>\
<text x="57" y="${y + 5}" class="line-label">${l.id === 'dados' ? 'Interface Dados' : l.id === 'ia' ? 'Interface IA' : l.id === 'projeto' ? 'Projeto & valor' : l.name}</text>\
</g>`;
    }).join(''))}
    ${raw(stations.map(s => {
      const l = lineFor(s); const status = stationStatus(s, state); const x = xpos(s.phase); const y = ypos(s.line); const words = s.title.split(' '); let first = '', second = '';
      for (const word of words) { if ((first + ' ' + word).trim().length <= 19 && !second) first = (first + ' ' + word).trim(); else second = (second + ' ' + word).trim(); }
      return html`<a href="#estacao=${s.id}" data-map-id="${s.id}" data-status="${status}" class="station${active.includes(s.line) ? '' : ' inactive'}${s.phase > state.project.stage ? ' future' : ''} line-${l.id}" aria-label="${mapStationLabel(s, status, state.project)}"><title>${s.summary}</title>\
<rect x="${x - 65}" y="${y - 20}" width="130" height="70" fill="transparent"/><circle class="station-halo" cx="${x}" cy="${y}" r="16"/><circle class="station-node" cx="${x}" cy="${y}" r="${s.phase === 5 ? 10 : 8}"/>\
<text x="${x}" y="${y + 4}" text-anchor="middle" class="station-check" aria-hidden="true">${stationStates[status].glyph}</text>\
<text x="${x}" y="${y + 28}" text-anchor="middle" class="station-label"><tspan x="${x}">${first}</tspan>${raw(second ? html`<tspan x="${x}" dy="14">${second}</tspan>` : '')}</text></a>`;
    }).join(''))}
    <text x="${reviewX}" y="558" text-anchor="middle" class="map-footnote">REVISÃO INTEGRADA</text>\
<text x="${decisionX}" y="558" text-anchor="middle" class="map-footnote">DECISÃO HUMANA</text>
    </svg>`;
  return top('Um mapa. Várias frentes.', 'Explore as estações. Cada uma reúne o que fazer, quem decide e quais evidências permitem avançar.', '01 / MAPA DO PROJETO') +
    html`<div class="map-card">\
<div class="map-toolbar"><span><span class="live-dot"></span> MAPA DE GOVERNANÇA</span><span>Selecione uma estação <span aria-hidden="true">↙</span></span>\
<button class="text-button" data-action="list">Ver em lista ≡</button>\
</div>\
<div class="map-scroll" tabindex="0" role="region" aria-label="Mapa de vias; em telas pequenas, deslize horizontalmente">${raw(svg)}</div>\
<div class="map-legend"><span><i class="legend-circle"></i>Estação com critérios</span><span><i class="legend-transfer"></i>Revisão entre frentes</span><span><i class="legend-complete">✓</i>Evidência completa</span><span><i class="legend-status" aria-hidden="true">◐</i>Em andamento</span><span><i class="legend-status" aria-hidden="true">!</i>Registro inválido</span><span><i class="legend-status" aria-hidden="true">–</i>Exceção</span><span class="map-mobile-note">← Deslize o mapa ou use a lista →</span>\
</div>\
</div>
    <div class="below-map">\
<p>As vias podem trabalhar em paralelo. Os marcos organizam decisões e se repetem a cada incremento. <button class="inline-button" data-guide="agil">Entenda o fluxo ↗</button>\
</p><span>O contorno tracejado indica estações fora da rota ou após o marco.</span>\
</div>` +
    html`<section class="gate-section">\
<div class="gate-heading">\
<h3>Avançar exige uma decisão.</h3><span>${phases.length} perguntas ao longo do percurso</span>\
</div>\
<div class="gates">${raw(phases.map(p => html`<button class="gate-card" data-phase="${p.id}"><span>0${p.id} <span aria-hidden="true">↗</span></span><strong>${p.gate}</strong><small>${p.name}</small>\
</button>`).join(''))}</div>\
</section>` +
    html`<section class="interface-strip"><span class="section-kicker">TRÊS GOVERNANÇAS, RESPONSABILIDADES CONECTADAS</span>\
<div><strong>Projetos coordena as decisões.</strong>\
<p>Dados e IA aprofundam os controles especializados. Aqui, você verifica os acionamentos, as dependências e os aceites entre elas.</p>\
</div>\
<button class="text-button" data-guide="dados">Interface com Dados ↗</button>\
<button class="text-button" data-guide="ia">Interface com IA ↗</button>\
</section>` + summaryMarkup();
}
