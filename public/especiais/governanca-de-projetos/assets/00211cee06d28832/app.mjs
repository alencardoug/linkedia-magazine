import { html, raw } from './html.mjs';
import { stations, phases } from './content.mjs';
import { templates } from './library.mjs';
import { STORAGE_KEY, emptyState, validateImport, activeLines, assessControl, evaluate, stationStatus, markdownReport, today } from './domain.mjs';
import { readStored } from './storage.mjs';
import { stationDetail, guideDetail, templateDetail, phaseDetail } from './dialogs.mjs';
import { mapMarkup, mapStationLabel } from './views/mapa.mjs';
import { checklistMarkup, stationListMarkup } from './views/checklist.mjs';
import { libraryMarkup, libraryResultsMarkup } from './views/biblioteca.mjs';
import { methodMarkup } from './views/metodo.mjs';
import { stationStates } from './views/shared.mjs';

const $ = s => document.querySelector(s);
let state = emptyState();
let storageProblem = '';
let recoveryText = null;
let blockSave = false;
let storedSnapshot = null;
let unsavedChanges = false;
let replacementSnapshot = null;
function loadStored() {
  const stored = readStored(() => localStorage);
  state = stored.state;
  storedSnapshot = stored.snapshot;
  recoveryText = stored.recoveryText;
  blockSave = stored.blockSave;
  storageProblem = stored.problem;
}
loadStored();
let view = 'mapa';
let originCard = null;
let libraryQuery = '';
let checkFilter = 'all';
let checkLine = 'all';
let checkQuery = '';
let toastTimer;
const dialog = $('#detail-dialog');

function notify(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6500); }
function refreshFromStorage() {
  const active = document.activeElement;
  const editing = active?.matches('#project-name, #project-context, [data-answer]');
  const focusSelector = active?.dataset.answer
    ? `[data-answer="${CSS.escape(active.dataset.answer)}"][data-field="${CSS.escape(active.dataset.field)}"]`
    : editing ? '#' + active.id : null;
  loadStored();
  if (checkLine !== 'all' && !activeLines(state.project).includes(checkLine)) checkLine = 'all';
  syncConfig();
  renderView();
  if (dialog.open && /^#(estacao|guia|modelo|marco)=/.test(location.hash)) routeHash(false);
  if (focusSelector) $(focusSelector)?.focus();
  notify(editing ? 'Outra aba atualizou a avaliação durante a edição. Confira o campo antes de continuar.' : 'Avaliação atualizada por outra aba.');
}
function save(change, replacement = false) {
  let changedElsewhere = false;
  try {
    changedElsewhere = localStorage.getItem(STORAGE_KEY) !== storedSnapshot;
    if (changedElsewhere && !unsavedChanges) refreshFromStorage();
  } catch {
    // A tentativa de gravação abaixo informa quando o armazenamento está indisponível.
  }
  if (replacement && (storedSnapshot !== replacementSnapshot || changedElsewhere)) {
    closeDialog();
    notify('Outra aba alterou a avaliação. Revise o registro e confirme a operação novamente.');
    return false;
  }
  change();
  unsavedChanges = true;
  if (!blockSave) {
    try {
      const serialized = JSON.stringify(state);
      if (localStorage.getItem(STORAGE_KEY) !== storedSnapshot) throw new Error('Registro alterado em outra aba.');
      localStorage.setItem(STORAGE_KEY, serialized);
      storedSnapshot = serialized;
      unsavedChanges = false;
      if (recoveryText === null) storageProblem = '';
    } catch {
      storageProblem = 'Não foi possível salvar nesta aba. Exporte JSON para guardar as respostas.';
      notify(storageProblem);
    }
  }
  updateSummary();
  return true;
}
function download(name, body, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function updateSummary() {
  const r = evaluate(state);
  if ($('#summary-percent')) {
    $('#summary-percent').innerHTML = html`${r.percent ?? '—'}<span>${r.percent === null ? '' : '%'}</span>`;
    $('#coverage-bar').value = r.percent ?? 0;
    $('#summary-outcome').textContent = r.outcome;
    $('#summary-count').textContent = `${r.verified} de ${r.applicable} critérios aplicáveis · ${r.excluded} exceções aceitas`;
    $('#summary-blockers').textContent = `${r.blockers.length} bloqueadores a verificar até ${phases[state.project.stage - 1].name.toLowerCase()}.`;
  }
  const note = $('#storage-note');
  if (note) {
    note.textContent = storageProblem || 'Salvo neste navegador · sem conta ou envio.';
    if (recoveryText !== null) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'text-button'; button.dataset.action = 'recover';
      button.textContent = 'Baixar registro original';
      note.append(' ', button);
    }
  }
  for (const s of stations) {
    const node = document.querySelector(`[data-map-id="${s.id}"]`);
    if (node) {
      const status = stationStatus(s, state);
      node.dataset.status = status;
      node.setAttribute('aria-label', mapStationLabel(s, status, state.project));
      node.querySelector('.station-check').textContent = stationStates[status].glyph;
    }
  }
}
const checklistFilters = () => ({ checkLine, checkFilter, checkQuery });
function renderStationList() {
  const root = $('#station-list');
  if (root) root.innerHTML = stationListMarkup(state, checklistFilters());
}
function renderLibrary() {
  const root = $('#library-results');
  if (root) root.innerHTML = libraryResultsMarkup(libraryQuery);
}
function configure() {
  $('#stage').innerHTML = phases.map(p => html`<option value="${p.id}">${String(p.id).padStart(2, '0')} · ${p.name}</option>`).join('');
  syncConfig();
}
function syncConfig() {
  for (const key of ['software', 'dados', 'ia']) { $(`#route-${key}`).checked = state.project[key] || (key !== 'ia' && state.project.ia); $(`#route-${key}`).disabled = key !== 'ia' && state.project.ia; }
  const rigorOptions = ['Essencial', 'Padrão', 'Alto impacto'];
  const phaseName = phases.find(p => p.id === state.project.stage).name;
  for (const [index, label] of rigorOptions.entries()) {
    const project = { ...state.project, rigor: index + 1 };
    const count = evaluate({ ...state, project }).items.length;
    $('#rigor').options[index].textContent = `${label} · ${count} critérios até ${phaseName}`;
  }
  $('#rigor').value = state.project.rigor;
  $('#stage').value = state.project.stage;
}
function renderView(scroll = false) {
  document.querySelectorAll('[data-view]').forEach(a => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#view-content').innerHTML = view === 'checklist' ? checklistMarkup(state, checklistFilters()) : view === 'biblioteca' ? libraryMarkup(libraryQuery) : view === 'metodo' ? methodMarkup() : mapMarkup(state);
  if (view === 'checklist') renderStationList(); if (view === 'biblioteca') renderLibrary(); updateSummary();
  if (scroll) $('.view-nav').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
function showDialog(kicker, body) {
  $('#answer-announcement').textContent = '';
  $('#dialog-kicker').textContent = kicker; $('#dialog-content').innerHTML = body;
  if (!dialog.open) { dialog.showModal(); document.body.classList.add('modal-open'); }
  dialog.scrollTop = 0;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); notify('Copiado.'); } catch { notify('A cópia automática não está disponível. Selecione o texto no painel ou baixe o arquivo.'); }
}
function closeDialog() { dialog.close(); }
dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  if (/^#(estacao|guia|modelo|marco)=/.test(location.hash)) history.replaceState(null, '', '#' + view);
  if (view === 'checklist') {
    renderStationList();
    if (originCard) (document.querySelector(`[data-station="${originCard}"]`) || $('#check-filter'))?.focus();
  }
  originCard = null;
  updateSummary();
});
$('#close-dialog').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
function routeHash(scroll = true) {
  const [kind, id] = location.hash.slice(1).split('=');
  if (['mapa', 'checklist', 'biblioteca', 'metodo'].includes(kind)) { if (dialog.open) dialog.close(); view = kind; renderView(scroll); }
  else {
    const details = { estacao: stationDetail, guia: guideDetail, modelo: templateDetail, marco: phaseDetail };
    const render = Object.hasOwn(details, kind) ? details[kind] : null;
    const detail = render?.(id, state);
    if (detail) showDialog(detail.kicker, detail.body);
  }
}
function navigateDetail(kind, id) { if (location.hash === `#${kind}=${id}`) routeHash(false); else location.hash = `${kind}=${id}`; }
document.addEventListener('click', event => {
  const target = event.target.closest('button, a'); if (!target) return;
  if (target.matches('.station-card')) originCard = target.dataset.station;
  if (target.dataset.station) navigateDetail('estacao', target.dataset.station);
  if (target.dataset.guide) navigateDetail('guia', target.dataset.guide);
  if (target.dataset.template) navigateDetail('modelo', target.dataset.template);
  if (target.dataset.phase) navigateDetail('marco', target.dataset.phase);
  if (target.dataset.view && location.hash === '#' + target.dataset.view) renderView(true);
  if (target.dataset.downloadTemplate) { const t = templates.find(t => t.id === target.dataset.downloadTemplate); download(t.id + '.md', t.body); }
  if (target.dataset.copyTemplate) copy(templates.find(t => t.id === target.dataset.copyTemplate).body);
  if (target.dataset.copy === 'prompt') copy($('#station-prompt').textContent);
  if (target.dataset.share) copy(location.href.split('#')[0] + '#' + target.dataset.share);
  if (target.classList.contains('info-button')) {
    const opened = target.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.info-button[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    target.setAttribute('aria-expanded', String(!opened));
  }
  const action = target.dataset.action;
  if (action === 'export') download('governanca-projeto-' + today() + '.json', JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'application/json');
  if (action === 'recover' && recoveryText !== null) download('governanca-projeto-registro-original.json', recoveryText, 'application/json');
  if (action === 'report') download('revisao-governanca-' + today() + '.md', markdownReport(state));
  if (action === 'import') $('#import-file').click();
  if (action === 'list') location.hash = 'checklist';
  if (action === 'reset') {
    replacementSnapshot = storedSnapshot;
    showDialog('AVALIAÇÃO LOCAL', '<h2 id="dialog-title">Limpar esta avaliação?</h2><p>As respostas e o contexto deste navegador serão removidos. Exporte um backup antes de continuar se precisar preservá-los.</p><div class="template-actions"><button class="button" data-action="export">Exportar antes de limpar</button><button class="button danger" data-action="confirm-reset">Limpar avaliação</button></div>');
  }
  if (action === 'confirm-reset' && save(() => { state = emptyState(); }, true)) { syncConfig(); closeDialog(); renderView(); notify(unsavedChanges ? storageProblem : 'Avaliação local limpa.'); }
  if (action === 'confirm-import' && pendingImport && save(() => { state = pendingImport; }, true)) { pendingImport = null; syncConfig(); closeDialog(); renderView(); notify(unsavedChanges ? storageProblem : 'Revisão importada. Evidências reavaliadas com a data atual.'); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.info-button[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); });
document.addEventListener('input', event => {
  const t = event.target;
  if (t.id === 'project-name' || t.id === 'project-context') { save(() => { state.project[t.id === 'project-name' ? 'name' : 'context'] = t.value; });
    const field = document.getElementById(t.id);
    if (field && field !== t) field.value = t.value; }
  if (t.id === 'check-search') { checkQuery = t.value; renderStationList(); }
  if (t.id === 'library-search') { libraryQuery = t.value; renderLibrary(); }
  if (t.dataset.answer && t.dataset.field !== 'status') updateAnswer(t);
});
function updateAnswer(t) {
  const { answer: id, field } = t.dataset;
  const value = t.value;
  save(() => { state.answers[id] = { status: 'pending', ...state.answers[id], [field]: value }; });
  const renderedField = $(`[data-answer="${id}"][data-field="${field}"]`);
  if (renderedField && renderedField !== t) renderedField.value = value;
  const c = stations.flatMap(s => s.controls).find(c => c.id === id); const a = state.answers[id]; const result = assessControl(c, a);
  const feedback = document.querySelector(`[data-feedback="${id}"]`);
  if (feedback) feedback.textContent = result.reason || (result.status === 'verified' ? 'Registro completo. Confirme o conteúdo da evidência com o revisor.' : result.status === 'na' ? 'Exceção registrada; fora do denominador.' : '');
  if (t.dataset.field === 'status' && ['verified', 'na'].includes(t.value)) renderedField?.closest('.control').querySelector('details')?.setAttribute('open', '');
}
document.addEventListener('change', event => {
  const t = event.target;
  if (t.dataset.answer) {
    if (t.dataset.field === 'status') updateAnswer(t);
    const feedback = $(`[data-feedback="${t.dataset.answer}"]`)?.textContent;
    $('#answer-announcement').textContent = feedback ? `${t.dataset.answer.toUpperCase()}. ${feedback}` : '';
  }
  if (t.id.startsWith('route-')) { const key = t.id.slice(6); const checked = t.checked; save(() => { state.project[key] = checked; }); checkLine = 'all'; syncConfig(); renderView(); }
  if (t.id === 'rigor' || t.id === 'stage') { const value = Number(t.value); save(() => { state.project[t.id] = value; }); syncConfig(); renderView(); }
  if (t.id === 'check-filter' || t.id === 'check-line') { if (t.id === 'check-filter') checkFilter = t.value; else checkLine = t.value; renderStationList(); }
});
let pendingImport = null;
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20_000_000) throw new Error('Arquivo muito grande. O limite de importação é 20 MB.');
    pendingImport = validateImport(JSON.parse(await file.text()));
    replacementSnapshot = storedSnapshot;
    const orphans = Object.keys(pendingImport.orphanAnswers);
    const orphanNotice = orphans.length ? html`<p>${orphans.length} respostas serão preservadas fora do cálculo: ${orphans.join(', ')}.</p>` : '';
    showDialog('IMPORTAR REVISÃO', html`<h2 id="dialog-title">Substituir a avaliação local?</h2>\
<p>Projeto do arquivo: <strong>${pendingImport.project.name || 'Sem nome'}</strong>. A importação substitui os registros deste navegador. As respostas serão recalculadas com a data atual.</p>${raw(orphanNotice)}<div class="template-actions">\
<button class="button" data-action="export">Exportar a atual</button>\
<button class="button primary" data-action="confirm-import">Importar e substituir</button>\
</div>`);
  } catch (error) { notify('Importação recusada: ' + error.message); }
  event.target.value = '';
});
window.addEventListener('hashchange', () => routeHash(true));
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage || ![null, STORAGE_KEY].includes(event.key) || event.newValue === storedSnapshot) return;
  if (unsavedChanges) {
    storageProblem = 'Outra aba alterou a avaliação. Exporte as mudanças desta aba antes de recarregar.';
    updateSummary();
    notify(storageProblem);
    return;
  }
  refreshFromStorage();
});
window.addEventListener('focus', updateSummary);
configure();
renderView();
routeHash(false);
$('#module-fallback').hidden = true;
if (storageProblem) notify(storageProblem);
