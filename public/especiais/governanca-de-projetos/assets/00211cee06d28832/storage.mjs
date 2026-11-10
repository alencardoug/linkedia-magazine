import { emptyState, migrateState, RECOVERY_KEY, STORAGE_KEY } from './domain.mjs';

export function readStored(getStorage) {
  const result = { state: emptyState(), snapshot: null, recoveryText: null, blockSave: false, problem: '' };
  let storage;
  try {
    storage = getStorage();
    result.recoveryText = storage.getItem(RECOVERY_KEY);
    result.snapshot = storage.getItem(STORAGE_KEY);
  } catch {
    result.problem = 'Armazenamento local indisponível. Exporte JSON para guardar as respostas.';
    return result;
  }
  if (result.snapshot === null) return result;
  try {
    result.state = migrateState(JSON.parse(result.snapshot));
  } catch {
    const earlierBackup = result.recoveryText;
    result.recoveryText = result.snapshot;
    try {
      if (earlierBackup !== null && earlierBackup !== result.snapshot) throw new Error('Já existe um backup diferente.');
      if (earlierBackup === null) storage.setItem(RECOVERY_KEY, result.snapshot);
      result.problem = 'O registro local é incompatível ou está danificado. Uma cópia do original está disponível para download.';
    } catch {
      result.blockSave = true;
      result.problem = 'O registro original não pôde ser copiado. O salvamento local está suspenso para preservá-lo. Baixe o registro original e exporte as novas respostas.';
    }
  }
  return result;
}
