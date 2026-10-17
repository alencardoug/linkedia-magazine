// Theme runtime (1C-01): slot switching, lazy enhancements, fallback to the baseline, and the pre-paint script.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '../src/lib/theme-init';
import { activeSlot, deviceAllows, saveChoice, themeController } from '../src/lib/theme-runtime';

// The few Element methods the runtime and the pre-paint script use.
function fakeRoot(attributes = {}) {
  const attrs = new Map(
    Object.entries({
      'data-theme': 'lab-2099-w02',
      'data-theme-baseline': 'minimal-dark',
      'data-theme-previous': 'lab-2099-w01',
      'data-theme-current': 'lab-2099-w02',
      ...attributes,
    }).filter(([, v]) => v !== null),
  );
  return {
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    attrs,
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('themeController', () => {
  it('applies a CSS-only slot without loading anything', async () => {
    const root = fakeRoot();
    const load = vi.fn();
    const themes = themeController({ root, enhancements: { 'lab-2099-w02': { requires: [], load } } });
    expect(await themes.apply('previous')).toBe('applied');
    expect(root.getAttribute('data-theme')).toBe('lab-2099-w01');
    expect(load).not.toHaveBeenCalled();
    expect(activeSlot(root)).toBe('previous');
  });

  it('runs the enhancement of the active theme and cleans it up on the next switch', async () => {
    const root = fakeRoot();
    const cleanup = vi.fn();
    let ctx;
    const enhance = vi.fn((c) => ((ctx = c), cleanup));
    const themes = themeController({
      root,
      enhancements: { 'lab-2099-w02': { requires: ['motion'], load: async () => ({ default: enhance }) } },
      allows: () => true,
    });
    expect(await themes.apply('current')).toBe('enhanced');
    expect(root.getAttribute('data-theme-enhanced')).toBe('lab-2099-w02');
    expect(ctx.root).toBe(root);
    expect(ctx.signal.aborted).toBe(false);
    expect(await themes.apply('baseline')).toBe('applied');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(ctx.signal.aborted).toBe(true);
    expect(root.getAttribute('data-theme')).toBe('minimal-dark');
    expect(root.getAttribute('data-theme-enhanced')).toBeNull();
  });

  it('keeps the theme CSS-only when the device does not meet a requirement', async () => {
    const root = fakeRoot();
    const load = vi.fn();
    const allows = vi.fn((r) => r !== 'webgl');
    const themes = themeController({
      root,
      enhancements: { 'lab-2099-w02': { requires: ['motion', 'webgl'], load } },
      allows,
    });
    expect(await themes.apply('current')).toBe('applied');
    expect(root.getAttribute('data-theme')).toBe('lab-2099-w02');
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ['the module fails to load', () => Promise.reject(new Error('404'))],
    ['the enhancement throws', async () => ({ default: () => { throw new Error('boom'); } })],
    ['the enhancement rejects', async () => ({ default: async () => { throw new Error('boom'); } })],
    ['the module has no default export', async () => ({})],
  ])('falls back to the baseline when %s', async (_, load) => {
    const root = fakeRoot();
    const onFallback = vi.fn();
    const themes = themeController({
      root,
      enhancements: { 'lab-2099-w02': { requires: [], load } },
      allows: () => true,
      onFallback,
    });
    expect(await themes.apply('current')).toBe('fallback');
    expect(root.getAttribute('data-theme')).toBe('minimal-dark');
    expect(root.getAttribute('data-theme-fallback')).toBe('lab-2099-w02');
    expect(onFallback).toHaveBeenCalledWith('lab-2099-w02', expect.anything());
    expect(warn).toHaveBeenCalled();
    // A later choice clears the fallback mark.
    expect(await themes.apply('previous')).toBe('applied');
    expect(root.getAttribute('data-theme-fallback')).toBeNull();
  });

  it('falls back when a running enhancement calls fail(), aborting and cleaning it up', async () => {
    const root = fakeRoot();
    const cleanup = vi.fn();
    let ctx;
    const themes = themeController({
      root,
      enhancements: {
        'lab-2099-w02': { requires: [], load: async () => ({ default: (c) => ((ctx = c), cleanup) }) },
      },
      allows: () => true,
    });
    expect(await themes.apply('current')).toBe('enhanced');
    ctx.fail(new Error('context lost'));
    expect(root.getAttribute('data-theme')).toBe('minimal-dark');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(ctx.signal.aborted).toBe(true);
    ctx.fail(new Error('again')); // ignored
    expect(warn).toHaveBeenCalledOnce();
  });

  it('cleans up at once when fail() is called before the enhancement returns', async () => {
    const root = fakeRoot();
    const cleanup = vi.fn();
    const themes = themeController({
      root,
      enhancements: {
        'lab-2099-w02': { requires: [], load: async () => ({ default: ({ fail }) => (fail('no'), cleanup) }) },
      },
      allows: () => true,
    });
    expect(await themes.apply('current')).toBe('fallback');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(root.getAttribute('data-theme')).toBe('minimal-dark');
  });

  it('never runs a module that finishes loading after another choice', async () => {
    const root = fakeRoot();
    const pending = deferred();
    const enhance = vi.fn();
    const themes = themeController({
      root,
      enhancements: { 'lab-2099-w02': { requires: [], load: () => pending.promise } },
      allows: () => true,
    });
    const first = themes.apply('current');
    expect(await themes.apply('baseline')).toBe('applied');
    pending.resolve({ default: enhance });
    expect(await first).toBe('stale');
    expect(enhance).not.toHaveBeenCalled();
    expect(root.getAttribute('data-theme')).toBe('minimal-dark');
    expect(root.getAttribute('data-theme-enhanced')).toBeNull();
  });

  it('ignores a superseded load failure and disposes a superseded async enhancement', async () => {
    const root = fakeRoot();
    const failing = deferred();
    const themes = themeController({
      root,
      enhancements: { 'lab-2099-w02': { requires: [], load: () => failing.promise } },
      allows: () => true,
    });
    const first = themes.apply('current');
    await themes.apply('previous');
    failing.reject(new Error('late'));
    expect(await first).toBe('stale');
    expect(root.getAttribute('data-theme')).toBe('lab-2099-w01');
    expect(root.getAttribute('data-theme-fallback')).toBeNull();

    const started = deferred();
    const cleanup = vi.fn();
    let ctx;
    const slow = themeController({
      root,
      enhancements: {
        'lab-2099-w02': { requires: [], load: async () => ({ default: (c) => ((ctx = c), started.promise) }) },
      },
      allows: () => true,
    });
    const running = slow.apply('current');
    await vi.waitFor(() => expect(ctx).toBeDefined());
    await slow.apply('baseline');
    expect(ctx.signal.aborted).toBe(true);
    ctx.fail('late'); // from a superseded enhancement: ignored
    started.resolve(cleanup);
    expect(await running).toBe('stale');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(root.getAttribute('data-theme')).toBe('minimal-dark');
  });

  it('switches even when a cleanup throws', async () => {
    const root = fakeRoot();
    const themes = themeController({
      root,
      enhancements: {
        'lab-2099-w02': { requires: [], load: async () => ({ default: () => () => { throw new Error('x'); } }) },
      },
      allows: () => true,
    });
    await themes.apply('current');
    expect(await themes.apply('previous')).toBe('applied');
    expect(root.getAttribute('data-theme')).toBe('lab-2099-w01');
  });

  it('reports an empty slot as unavailable and changes nothing', async () => {
    const root = fakeRoot({ 'data-theme-previous': null });
    const themes = themeController({ root, enhancements: {} });
    expect(await themes.apply('previous')).toBe('unavailable');
    expect(root.getAttribute('data-theme')).toBe('lab-2099-w02');
  });
});

describe('device and storage', () => {
  it('checks reduced motion and fails closed on unknown requirements', () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
    expect(deviceAllows('motion')).toBe(false);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(deviceAllows('motion')).toBe(true);
    expect(deviceAllows('gpu')).toBe(false);
  });

  it('saves the slot and survives a storage that throws', () => {
    const items = new Map();
    saveChoice('previous', () => ({ setItem: (k, v) => items.set(k, v) }));
    expect(items.get(THEME_STORAGE_KEY)).toBe('previous');
    expect(() =>
      saveChoice('baseline', () => {
        throw new DOMException('denied', 'SecurityError');
      }),
    ).not.toThrow();
    expect(() => saveChoice('baseline', () => ({ setItem: () => { throw new Error('quota'); } }))).not.toThrow();
  });
});

describe('pre-paint script', () => {
  function run(stored, attributes) {
    const root = fakeRoot(attributes);
    const storage =
      stored instanceof Error
        ? { getItem: () => { throw stored; } }
        : { getItem: (k) => (k === THEME_STORAGE_KEY ? stored : null) };
    new Function('document', 'localStorage', THEME_INIT_SCRIPT)({ documentElement: root }, storage);
    return root.getAttribute('data-theme');
  }

  it('applies a stored slot that has a theme', () => {
    expect(run('baseline')).toBe('minimal-dark');
    expect(run('previous')).toBe('lab-2099-w01');
    expect(run('current')).toBe('lab-2099-w02');
  });

  it('keeps the build-time default otherwise', () => {
    expect(run(null)).toBe('lab-2099-w02');
    expect(run('lab-2099-w01')).toBe('lab-2099-w02'); // ids are not slots
    expect(run('theme')).toBe('lab-2099-w02'); // would read data-theme-theme
    expect(run('previous', { 'data-theme-previous': null })).toBe('lab-2099-w02');
    expect(run(new DOMException('denied', 'SecurityError'))).toBe('lab-2099-w02');
  });

  it('stays tiny', () => {
    expect(THEME_INIT_SCRIPT.length).toBeLessThanOrEqual(300);
  });
});
