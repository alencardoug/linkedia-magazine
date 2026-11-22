// Reading mode (V2-06, D-081): light, dark and black. Without a stored pick the pages follow the system's
// light/dark (and its changes); black is only ever an explicit pick. `public/modo.js` applies the stored pick before
// the first paint; this module wires the header button (Base.astro) that cycles light → dark → black and stores the
// pick under one versioned key, shared by every reading page, `/visual` included (one origin).

export const MODE_KEY = 'linkedia:modo:v1';
/** The weekly-theme slot key (1C-01, retired by V2-06): removed on the first visit after the switch. */
export const LEGACY_THEME_KEY = 'linkedia:tema';
export const MODES = ['light', 'dark', 'black'] as const;
export type Mode = (typeof MODES)[number];
export const MODE_LABEL: Readonly<Record<Mode, string>> = { light: 'Claro', dark: 'Escuro', black: 'Preto' };

/** A stored value as a mode; anything else (absent, old, tampered) is no pick. */
export function parseMode(value: unknown): Mode | null {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value) ? (value as Mode) : null;
}

export function nextMode(mode: Mode): Mode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

/** The mode on screen: the pick, or the system's light/dark (never black). */
export function effectiveMode(pick: Mode | null, systemDark: boolean): Mode {
  return pick ?? (systemDark ? 'dark' : 'light');
}

function readPick(): Mode | null {
  try {
    return parseMode(localStorage.getItem(MODE_KEY));
  } catch {
    return null;
  }
}

function storePick(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage blocked (private mode, policy): the pick lasts for this page view */
  }
}

export function initModeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-mode-toggle]');
  if (!button) return;
  const label = button.querySelector<HTMLElement>('[data-mode-label]');
  const hint = document.querySelector<HTMLElement>('[data-mode-next]');
  const status = document.querySelector<HTMLElement>('[data-mode-status]');
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  try {
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    /* nothing to clean up */
  }

  const current = (): Mode => effectiveMode(parseMode(root.dataset.mode), system.matches);
  const sync = () => {
    const mode = current();
    button.dataset.current = mode;
    if (label) label.textContent = MODE_LABEL[mode];
    if (hint) hint.textContent = `Muda para o modo ${MODE_LABEL[nextMode(mode)].toLowerCase()}.`;
  };
  const apply = (pick: Mode | null) => {
    if (pick) root.dataset.mode = pick;
    else delete root.dataset.mode;
    sync();
  };

  // A value the bootstrap left out (tampered attribute) never counts as a pick.
  apply(parseMode(root.dataset.mode));
  button.hidden = false;
  button.addEventListener('click', () => {
    const mode = nextMode(current());
    apply(mode);
    storePick(mode);
    if (status) status.textContent = `Modo ${MODE_LABEL[mode].toLowerCase()} ativado.`;
  });
  system.addEventListener('change', sync);
  // Another tab changed the pick, or the page came back from the back/forward cache.
  addEventListener('storage', (e) => {
    if (e.key === MODE_KEY || e.key === null) apply(readPick());
  });
  addEventListener('pageshow', (e) => {
    if (e.persisted) apply(readPick() ?? parseMode(root.dataset.mode));
  });
}
