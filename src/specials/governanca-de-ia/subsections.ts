// Anchors of the guide's sections and subsections, with the short names used by the §1 "where developed" links.
// Section anchors keep the D-075 ids; subsections get stable ids of their own (3-22).
export const SUB: Record<string, { id: string; short: string }> = {
  '4.1': { id: 'frentes', short: 'Seis frentes' },
  '4.2': { id: 'inventario', short: 'Inventário' },
  '4.3': { id: 'classes-de-risco', short: 'Classes de risco' },
  '5.1': { id: 'disciplinas', short: 'Sete disciplinas' },
  '5.2': { id: 'repositorio', short: 'Repositório' },
  '6': { id: 'integracao', short: 'Camada de integração' },
  '7.1': { id: 'controles-declarados', short: 'Controles declarados' },
  '7.2': { id: 'automatizar', short: 'Automatizar ou não' },
  '8': { id: 'gates', short: 'Ciclo de vida e gates' },
  '9.1': { id: 'o-caso', short: 'O caso' },
  '9.2': { id: 'arquitetura-do-caso', short: 'Arquitetura do caso' },
  '9.3': { id: 'decisoes-do-caso', short: 'Decisões' },
  '9.4': { id: 'controles-do-caso', short: 'Controles do caso' },
  '9.5': { id: 'homologacao', short: 'Matriz de homologação' },
  '9.6': { id: 'evidencias-do-piloto', short: 'Evidências do piloto' },
  '10': { id: 'responsabilidades', short: 'Responsabilidades' },
  '10.1': { id: 'sem-burocracia', short: 'Sem burocracia' },
  '11.1': { id: 'criterios-de-sucesso', short: 'Critérios de sucesso' },
  '12.1': { id: 'lista-de-indicadores', short: 'Indicadores' },
  '12.2': { id: 'maturidade', short: 'Maturidade' },
};
