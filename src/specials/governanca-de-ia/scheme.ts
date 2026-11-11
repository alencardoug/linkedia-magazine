// Header toggle of the guide's light/dark choice (3-22, D-077: this page only). The page follows the system until the
// reader presses the button; the pick is stored per browser and applied before the first paint by esquema.js.
const KEY = 'linkedia.guia-ia.esquema';
const root = document.documentElement;
const system = matchMedia('(prefers-color-scheme: dark)');

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function isDark(): boolean {
  const pick = root.dataset.scheme;
  return pick === 'escuro' || (pick !== 'claro' && system.matches);
}

export function initScheme(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-scheme-toggle]');
  if (!button) return;
  const sync = () => button.setAttribute('aria-pressed', String(isDark()));
  button.hidden = false;
  sync();
  button.addEventListener('click', () => {
    const pick = isDark() ? 'claro' : 'escuro';
    root.dataset.scheme = pick;
    try {
      localStorage.setItem(KEY, pick);
    } catch {
      /* private mode: the pick lasts for this page view */
    }
    sync();
  });
  system.addEventListener('change', sync);
  // Another tab changed the pick, or the page came back from the back/forward cache.
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    const pick = stored();
    if (pick === 'claro' || pick === 'escuro') root.dataset.scheme = pick;
    else delete root.dataset.scheme;
    sync();
  });
  addEventListener('pageshow', sync);
}
