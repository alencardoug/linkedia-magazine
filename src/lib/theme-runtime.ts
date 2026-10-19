// Theme switching in the browser (D-025, docs/VISUAL_LAB.md, 1C-01). Themes only set `data-theme` on <html>;
// an optional enhancement module is imported only while its theme is active and the device meets its
// requirements, and any failure falls back to the baseline. The reader's choice is a slot (baseline, previous,
// current), so "current" follows each new weekly experiment.
import { THEME_STORAGE_KEY } from './theme-init';

export const SLOTS = ['baseline', 'previous', 'current'] as const;
export type SlotName = (typeof SLOTS)[number];

export interface ThemeSlot {
  id: string;
  title: string;
  requires: string[] | null;
}
export interface ThemeSlots {
  baseline: ThemeSlot;
  previous: ThemeSlot | null;
  current: ThemeSlot | null;
}

/** What an enhancement module receives. It must stop all work when `signal` aborts (or return a cleanup). */
export interface EnhanceContext {
  root: HTMLElement;
  signal: AbortSignal;
  /** Gives up on the theme at any time (e.g. WebGL context lost): the page falls back to the baseline. */
  fail: (reason?: unknown) => void;
}
export type Cleanup = () => void;
/** Default export of `themes/<id>/enhance.ts`. It may decorate the page but never changes article content. */
export type Enhance = (ctx: EnhanceContext) => void | Cleanup | Promise<void | Cleanup>;
export interface EnhancementEntry {
  requires: readonly string[];
  load: () => Promise<{ default: Enhance }>;
}

export type Outcome = 'applied' | 'enhanced' | 'fallback' | 'stale' | 'unavailable';

export function isSlot(value: unknown): value is SlotName {
  return typeof value === 'string' && (SLOTS as readonly string[]).includes(value);
}

/** The stored slot is read back only by the pre-paint script (theme-init.ts). */
export function saveChoice(slot: SlotName, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(THEME_STORAGE_KEY, slot);
  } catch {
    // Private mode or storage disabled: the choice lasts for this page only.
  }
}

let webgl: boolean | undefined;

/** Unknown requirements are unmet (fail closed). */
export function deviceAllows(requirement: string): boolean {
  if (requirement === 'motion') return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (requirement === 'webgl') {
    if (webgl === undefined) {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        webgl = gl !== null;
      } catch {
        webgl = false;
      }
    }
    return webgl;
  }
  return false;
}

const ATTRIBUTE: Record<SlotName, string> = {
  baseline: 'data-theme-baseline',
  previous: 'data-theme-previous',
  current: 'data-theme-current',
};

export function slotTheme(root: HTMLElement, slot: SlotName): string | null {
  return root.getAttribute(ATTRIBUTE[slot]) || null;
}

export function activeSlot(root: HTMLElement): SlotName | null {
  const id = root.getAttribute('data-theme');
  return SLOTS.find((slot) => slotTheme(root, slot) === id) ?? null;
}

export interface ControllerOptions {
  root: HTMLElement;
  enhancements: Readonly<Record<string, EnhancementEntry>>;
  allows?: (requirement: string) => boolean;
  /** Called after a theme failed and the baseline was applied instead. */
  onFallback?: (failedThemeId: string, reason: unknown) => void;
  /** Where uncaught errors surface (`window`); null disables the safety net. */
  errors?: EventTarget | null;
}

/**
 * Applies slots one at a time. A later `apply` supersedes an earlier one still loading (its module never runs,
 * or its cleanup runs at once); `fail()` from a superseded enhancement is ignored. While an enhancement runs,
 * any uncaught error or unhandled rejection on the page (a throwing timer, frame or event handler included)
 * counts as its failure: the site's own scripts are tiny, so the enhancement is the likely cause.
 */
export function themeController({
  root,
  enhancements,
  allows = deviceAllows,
  onFallback,
  errors = typeof addEventListener === 'function' ? globalThis : null,
}: ControllerOptions) {
  let generation = 0;
  let running: { abort: AbortController; cleanup: Cleanup | null } | null = null;

  function stop(): void {
    const current = running;
    running = null;
    root.removeAttribute('data-theme-enhanced');
    if (!current) return;
    current.abort.abort();
    try {
      current.cleanup?.();
    } catch {
      // A broken cleanup must not keep the page from switching.
    }
  }

  function fallback(id: string, reason: unknown): void {
    generation += 1;
    stop();
    root.setAttribute('data-theme', slotTheme(root, 'baseline') ?? 'minimal-dark');
    root.setAttribute('data-theme-fallback', id);
    console.warn(`[linkedia] tema ${id} falhou; usando o baseline.`, reason);
    onFallback?.(id, reason);
  }

  async function apply(slot: SlotName): Promise<Outcome> {
    const id = slotTheme(root, slot);
    if (!id) return 'unavailable';
    const mine = ++generation;
    stop();
    root.setAttribute('data-theme', id);
    root.removeAttribute('data-theme-fallback');
    const entry = enhancements[id];
    if (!entry || !entry.requires.every((r) => allows(r))) return 'applied';

    const abort = new AbortController();
    const state = { abort, cleanup: null as Cleanup | null };
    running = state;
    let failed = false;
    const fail = (reason?: unknown) => {
      if (failed || mine !== generation) return;
      failed = true;
      fallback(id, reason);
    };
    const dispose = (cleanup: unknown) => {
      try {
        if (typeof cleanup === 'function') cleanup();
      } catch {
        // ignored, as in stop()
      }
    };
    try {
      const module = await entry.load();
      if (mine !== generation) return failed ? 'fallback' : 'stale';
      const uncaught = (event: Event) => fail('error' in event ? event.error : 'reason' in event ? event.reason : event);
      errors?.addEventListener('error', uncaught, { signal: abort.signal });
      errors?.addEventListener('unhandledrejection', uncaught, { signal: abort.signal });
      const cleanup = await module.default({ root, signal: abort.signal, fail });
      if (failed || mine !== generation) {
        dispose(cleanup);
        return failed ? 'fallback' : 'stale';
      }
      if (typeof cleanup === 'function') state.cleanup = cleanup;
      root.setAttribute('data-theme-enhanced', id);
      return 'enhanced';
    } catch (err) {
      fail(err);
      return failed ? 'fallback' : 'stale';
    }
  }

  return { apply, stop };
}

/** Wires the switcher (ThemeSwitcher.astro, on `/visual` only) when the page has one and starts the active theme's
 * enhancement. */
export function startThemes(enhancements: Readonly<Record<string, EnhancementEntry>>): void {
  const root = document.documentElement;
  const switcher = document.querySelector<HTMLFieldSetElement>('[data-theme-switcher]');
  const status = switcher?.querySelector<HTMLElement>('[data-theme-status]') ?? null;
  const radio = (slot: SlotName) => switcher?.querySelector<HTMLInputElement>(`input[value="${slot}"]`) ?? null;
  const title = (slot: SlotName) => radio(slot)?.dataset.themeTitle ?? slotTheme(root, slot) ?? '';
  const say = (text: string) => {
    if (status) status.textContent = text;
  };
  const themes = themeController({
    root,
    enhancements,
    onFallback: (id) => {
      const failed = SLOTS.find((s) => slotTheme(root, s) === id);
      const baseline = radio('baseline');
      if (baseline) baseline.checked = true;
      say(`O tema ${failed ? title(failed) : id} falhou; voltamos ao ${title('baseline')}.`);
    },
  });

  const start = activeSlot(root) ?? 'baseline';
  const checked = radio(start);
  if (checked) checked.checked = true;
  if (switcher) {
    switcher.hidden = false;
    switcher.addEventListener('change', (event) => {
      const value = (event.target as HTMLInputElement).value;
      if (!isSlot(value)) return;
      saveChoice(value);
      say(`Tema aplicado: ${title(value)}.`);
      void themes.apply(value);
    });
  }
  void themes.apply(start);
}
