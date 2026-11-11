// The guide's interactive pieces (Codex round 1, ranked): each is a native button with aria-pressed that changes what
// a diagram highlights; the default state (and the page without JS) shows everything, and nothing is stored.

/** Unhides a tool group that only works with JS. */
function reveal(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  el.hidden = false;
  return true;
}

/** §6: the failure counterfactual — the test fails, the path returns to the implementation. */
export function initChain(): void {
  const chain = document.querySelector<HTMLElement>('[data-chain]');
  const tools = chain?.querySelector<HTMLElement>('[data-chain-tools]') ?? null;
  const button = chain?.querySelector<HTMLButtonElement>('[data-fail-toggle]');
  if (!chain || !button || !reveal(tools)) return;
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    chain.toggleAttribute('data-fail', on);
  });
}

/** One-of-many highlight buttons (pressing the pressed one again shows everything). */
function pickOne(root: HTMLElement, buttons: HTMLButtonElement[], key: string, attr: string): void {
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const on = button.getAttribute('aria-pressed') !== 'true';
      for (const b of buttons) b.setAttribute('aria-pressed', String(on && b === button));
      if (on) root.setAttribute(attr, button.dataset[key] ?? '');
      else root.removeAttribute(attr);
    });
  }
}

/** §7.1: highlight the YAML lines that declare one link of the §6 thread. */
export function initYaml(): void {
  const yaml = document.querySelector<HTMLElement>('[data-yaml]');
  const tools = yaml?.querySelector<HTMLElement>('[data-yaml-tools]') ?? null;
  if (!yaml || !reveal(tools)) return;
  pickOne(yaml, [...tools.querySelectorAll<HTMLButtonElement>('button[data-kind]')], 'kind', 'data-show');
}

/** §9.2: light one branch of the architecture (the question path through RAG, or the scheduling path). */
export function initRoutes(): void {
  const arch = document.querySelector<HTMLElement>('[data-arch]');
  const tools = arch?.querySelector<HTMLElement>('[data-route-tools]') ?? null;
  if (!arch || !reveal(tools)) return;
  pickOne(arch, [...tools.querySelectorAll<HTMLButtonElement>('button[data-route]')], 'route', 'data-route');
}
