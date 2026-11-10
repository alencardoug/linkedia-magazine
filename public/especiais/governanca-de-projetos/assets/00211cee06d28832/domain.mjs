import { stations, version } from './content.mjs';

export const STORAGE_KEY = 'linkedia.gov-projetos.v1';
export const RECOVERY_KEY = STORAGE_KEY + '.recuperacao';
export const emptyState = () => ({ schemaVersion: 1, contentVersion: version, project: { name: '', context: '', rigor: 2, stage: 6, software: true, dados: true, ia: true }, answers: {}, orphanAnswers: {} });
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function activeLines(project) {
  return ['projeto', 'seguranca', 'operacao', ...(project.software || project.ia ? ['software'] : []), ...(project.dados || project.ia ? ['dados'] : []), ...(project.ia ? ['ia'] : [])];
}
export function routeStations(project, until = project.stage) {
  const active = activeLines(project);
  return stations.filter(s => active.includes(s.line) && s.phase <= until);
}
export function checksFor(station, project) { return station.controls.filter(c => c.tier <= project.rigor); }
export function assessControl(control, answer = {}, day = today()) {
  const dateOK = validDate(answer.reviewedOn) && answer.reviewedOn <= day;
  const reviewerOK = typeof answer.reviewer === 'string' && answer.reviewer.trim().length > 0;
  const expiresOK = !answer.expiresOn || (validDate(answer.expiresOn) && answer.expiresOn >= day && answer.expiresOn >= answer.reviewedOn);
  if (answer.status === 'verified') {
    const reason = !answer.evidence?.trim() ? 'Falta referência da evidência.' : !reviewerOK ? 'Falta revisor.' : !dateOK ? 'A data da revisão deve existir e não pode ser futura.' : !expiresOK ? 'Evidência vencida ou validade inválida.' : '';
    return { status: reason ? 'invalid' : 'verified', reason };
  }
  if (answer.status === 'na') {
    const reason = control.critical ? 'Bloqueadores não aceitam dispensa neste guia.' : !answer.reason?.trim() ? 'Justifique a não aplicação.' : !reviewerOK ? 'Falta revisor da exceção.' : !dateOK ? 'A revisão da exceção precisa de data válida e não futura.' : !expiresOK ? 'Exceção vencida ou validade inválida.' : '';
    return { status: reason ? 'invalid' : 'na', reason };
  }
  return { status: answer.status === 'partial' ? 'partial' : 'pending', reason: '' };
}
export function evaluate(state, until = state.project.stage, day = today()) {
  const items = routeStations(state.project, until).flatMap(s => checksFor(s, state.project).map(c => ({ station: s, control: c, answer: state.answers[c.id] || {}, ...assessControl(c, state.answers[c.id], day) })));
  const verified = items.filter(i => i.status === 'verified').length;
  const excluded = items.filter(i => i.status === 'na').length;
  const applicable = items.length - excluded;
  const blockers = items.filter(i => i.control.critical && i.status !== 'verified');
  const open = items.filter(i => !['verified', 'na'].includes(i.status));
  const started = items.some(i => i.answer.status && i.answer.status !== 'pending');
  const outcome = !started ? 'Não avaliado' : blockers.length ? 'Bloqueado' : open.length ? 'Revisão pendente' : 'Evidências completas';
  return { items, verified, excluded, applicable, blockers, open, started, outcome, percent: applicable ? Math.round(verified / applicable * 100) : null };
}
export function stationStatus(station, state, day = today()) {
  const checks = checksFor(station, state.project);
  const statuses = checks.map(c => assessControl(c, state.answers[c.id], day).status);
  if (statuses.every(s => s === 'na')) return 'na';
  if (statuses.every(s => ['verified', 'na'].includes(s))) return 'verified';
  if (statuses.includes('invalid')) return 'invalid';
  if (statuses.some(s => s !== 'pending')) return 'partial';
  return 'pending';
}
const semverMajor = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value)?.[1];
const controlIds = new Set(stations.flatMap(s => s.controls.map(c => c.id)));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateImport(data) {
  if (data?.contentVersion !== version) throw new Error('Arquivo incompatível. Use uma exportação JSON da versão ' + version + ' deste guia.');
  return normalizeState(data);
}
export function migrateState(data) {
  if (semverMajor(data?.contentVersion) !== semverMajor(version)) throw new Error('Versão de conteúdo incompatível.');
  return normalizeState(data);
}
function normalizeState(data) {
  if (!isRecord(data) || data.schemaVersion !== 1) throw new Error('Versão do esquema incompatível.');
  const p = data.project;
  if (!p || typeof p.name !== 'string' || p.name.length > 200 || typeof p.context !== 'string' || p.context.length > 4000 || ![1, 2, 3].includes(p.rigor) || !Number.isInteger(p.stage) || p.stage < 1 || p.stage > 7 || ['software', 'dados', 'ia'].some(k => typeof p[k] !== 'boolean')) throw new Error('Configuração do projeto inválida.');
  const legacyOrphans = Object.hasOwn(data, 'orphanAnswers') ? data.orphanAnswers : {};
  if (!isRecord(data.answers) || !isRecord(legacyOrphans)) throw new Error('Respostas inválidas.');
  const answers = {};
  const orphanAnswers = {};
  for (const [key, value] of [...Object.entries(legacyOrphans), ...Object.entries(data.answers)]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(key) || ['constructor', 'prototype'].includes(key)) throw new Error('Identificador de critério inválido.');
    if (Object.hasOwn(answers, key) || Object.hasOwn(orphanAnswers, key)) throw new Error('Resposta duplicada: ' + key);
    if (!isRecord(value) || !['pending', 'partial', 'verified', 'na'].includes(value.status)) throw new Error('Estado de resposta inválido.');
    const answer = { status: value.status };
    for (const field of ['evidence', 'reviewer', 'reviewedOn', 'expiresOn', 'reason', 'notes']) {
      if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > 4000)) throw new Error('Campo de resposta inválido.');
      if (value[field] !== undefined) answer[field] = value[field];
    }
    (controlIds.has(key) ? answers : orphanAnswers)[key] = answer;
  }
  return { schemaVersion: 1, contentVersion: version, project: { name: p.name, context: p.context, rigor: p.rigor, stage: p.stage, software: p.software, dados: p.dados, ia: p.ia }, answers, orphanAnswers };
}

export function markdownReport(state, day = today()) {
  const r = evaluate(state, state.project.stage, day);
  const clean = v => String(v || '').replace(/\r?\n/g, ' ');
  const orphans = Object.entries(state.orphanAnswers || {});
  const orphanReport = orphans.length ? '\n## Respostas preservadas fora do cálculo\n\n' +
    orphans.map(([id, answer]) => `- ${id} · estado: ${answer.status}; referência: ${clean(answer.evidence) || '—'}; revisor/data: ${clean(answer.reviewer) || '—'} / ${clean(answer.reviewedOn) || '—'}; validade: ${clean(answer.expiresOn) || '—'}; exceção: ${clean(answer.reason) || '—'}; observações: ${clean(answer.notes) || '—'}`).join('\n') + '\n' : '';
  return `# Governança de Projetos — revisão local\n\nProjeto: ${clean(state.project.name) || 'Sem nome'}\nData: ${day}\nConteúdo: ${version}\nMarco: ${state.project.stage}\nRigor: ${state.project.rigor}\nFrentes: ${activeLines(state.project).join(', ')}\nContexto e justificativa da rota: ${clean(state.project.context) || 'Não informado'}\n\nCobertura verificada: ${r.percent ?? '—'}% (${r.verified}/${r.applicable}); exceções válidas: ${r.excluded}.\nSituação: ${r.outcome}. Bloqueadores a verificar: ${r.blockers.length}.\n\nAutoavaliação declaratória: referências não foram auditadas pelo site. Não é probabilidade de sucesso nem autorização de liberação.\n\n## Critérios até o marco\n\n` + r.items.map(i => `### ${i.control.id} · ${i.station.title}\n- Pergunta: ${i.control.question}\n- Estado declarado: ${i.answer.status || 'pending'}; avaliação: ${i.status}${i.reason ? ' — ' + i.reason : ''}\n- Bloqueador: ${i.control.critical ? 'sim' : 'não'}\n- Evidência esperada: ${i.control.evidence}\n- Referência: ${clean(i.answer.evidence) || 'Não informada'}\n- Revisor/data: ${clean(i.answer.reviewer) || '—'} / ${clean(i.answer.reviewedOn) || '—'}\n- Validade: ${clean(i.answer.expiresOn) || 'Não definida'}\n- Exceção: ${clean(i.answer.reason) || '—'}\n- Observações: ${clean(i.answer.notes) || '—'}\n`).join('\n') + orphanReport + '\n## Decisão humana\nOpção: [preencher]\nFundamento e condições: [preencher]\nAutoridade e data: [preencher]\nPróxima revisão: [preencher]\n';
}
