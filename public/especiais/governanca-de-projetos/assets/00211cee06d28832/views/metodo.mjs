import { html, raw } from '../html.mjs';
import { glossary, sources, version, reviewedOn, relatedGovernance } from '../content.mjs';
import { relatedLink, top } from './shared.mjs';

export function methodMarkup() {
  return top('Uma base para boas decisões.', 'Critérios editoriais verificáveis, referências abertas e limites explícitos sobre o que esta avaliação pode dizer.', '04 / MÉTODO & FONTES') +
    html`<div class="method-intro">\
<h3>Prontidão é evidência.<br>Sucesso é resultado observado.</h3>\
<div>\
<p>Este guia conecta governança, gestão e engenharia de projetos de TI. A linha de Projetos coordena propósito, capacidade, decisões, entregas, riscos e benefícios. As interfaces de Dados e IA verificam os acordos e pareceres das governanças especializadas.</p>\
<p>A cobertura verificada descreve os registros desta avaliação. Ela não estima probabilidade de sucesso, não certifica conformidade e não substitui a autoridade responsável por uma decisão.</p>\
<button class="button" data-guide="metodo">Entender critérios e cálculo ↗</button>\
</div>\
</div>\
<section class="governance-interfaces">\
<h3>Três governanças conectadas</h3>\
<div class="interface-grid">\
<article><span class="section-kicker">VOCÊ ESTÁ AQUI</span>\
<h4>Governança de Projetos</h4>\
<p>Orquestra investimento, pessoas, riscos, decisões e resultados. Cobra evidências e resolve dependências entre frentes.</p>\
</article>\
<article><span class="section-kicker">PROJETO DEDICADO · GDADOS</span>\
<h4>Governança de Dados</h4>\
<p>Aprofunda responsabilidade, semântica, qualidade, políticas e ciclo de vida dos dados. ${relatedGovernance.dados.url ? 'O aprofundamento está no projeto dedicado.' : 'O endereço público será incluído quando estiver disponível.'}</p>${raw(relatedLink('dados'))}<button class="inline-button" data-guide="dados">Ver interface com Projetos ↗</button>\
</article>\
<article><span class="section-kicker">ESPECIAL DO LINKEDIA</span>\
<h4>Governança de IA</h4>\
<p>Aprofunda os riscos e controles do uso de IA. Fornece ao projeto o parecer, as condições de uso e os gatilhos de reavaliação.</p>${raw(relatedLink('ia'))}</article>\
</div>\
</section>\
<section class="method-articles">\
<button class="template-card" data-guide="agil"><span><strong>Um fluxo com ciclos e paralelismo</strong><small>Como usar os marcos com entrega ágil, preditiva ou híbrida.</small></span>↗</button>\
<button class="template-card" data-guide="valor"><span><strong>O que fica para a fase 2</strong><small>Portfólio, histórico, alertas e avaliação de previsões com dados reais.</small></span>↗</button>\
</section>\
<section>\
<h3 class="library-heading">Glossário essencial</h3>\
<div class="glossary-grid">${raw(glossary.map(([term, meaning]) => html`<details><summary>${term}</summary><p>${meaning}</p></details>`).join(''))}</div>\
</section>\
<section>\
<h3 class="library-heading">Referências e origem</h3>\
<p class="library-caption">Síntese editorial própria. Os critérios não constituem reprodução integral, certificação ou lista oficial de requisitos das referências.</p>\
<div class="source-list">${raw(sources.map(s => html`<article>\
<h4>${raw(s.url ? html`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name} ↗</a>` : html`${s.name}`)}</h4>\
<p>${s.note}</p>\
</article>`).join(''))}</div>\
</section>\
<div class="method-footer"><span>Conteúdo ${version} · revisão editorial ${reviewedOn}</span><a href="/especiais/governanca-de-projetos/guia-completo">Abrir leitura e impressão ↗</a>\
</div>`;
}
