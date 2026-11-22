// Reading modes (V2-06, D-081): the pure rules of src/lib/mode.ts and the pre-paint bootstrap public/modo.js, run
// against a fake document and storage (the browser behaviour is in e2e/modes.spec.mjs).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { effectiveMode, LEGACY_THEME_KEY, MODE_KEY, MODE_LABEL, MODES, nextMode, parseMode } from '../src/lib/mode';

const ROOT = resolve(import.meta.dirname, '..');
const BOOTSTRAP = readFileSync(join(ROOT, 'public/modo.js'), 'utf8');

/** Runs the bootstrap with `stored` in storage (or a throwing storage) and returns the attributes it set. */
function bootstrap(stored, { throws = false } = {}) {
  const attrs = {};
  const reads = [];
  const localStorage = {
    getItem(key) {
      reads.push(key);
      if (throws) throw new Error('SecurityError');
      return stored;
    },
  };
  const document = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  runInNewContext(BOOTSTRAP, { localStorage, document });
  return { attrs, reads };
}

describe('mode rules', () => {
  it('has three modes with pt-BR labels, cycling light → dark → black → light', () => {
    expect(MODES).toEqual(['light', 'dark', 'black']);
    expect(MODE_LABEL).toEqual({ light: 'Claro', dark: 'Escuro', black: 'Preto' });
    expect(MODES.map(nextMode)).toEqual(['dark', 'black', 'light']);
  });

  it('follows the system without a pick and never picks black on its own', () => {
    expect(effectiveMode(null, false)).toBe('light');
    expect(effectiveMode(null, true)).toBe('dark');
    for (const m of MODES) for (const dark of [false, true]) expect(effectiveMode(m, dark)).toBe(m);
  });

  it('accepts only the three values as a pick', () => {
    for (const m of MODES) expect(parseMode(m)).toBe(m);
    for (const bad of [null, undefined, '', 'Dark', ' dark', 'preto', 'current', 'baseline', 'lab-2026-w43', 1, {}]) {
      expect(parseMode(bad), String(bad)).toBeNull();
    }
  });

  it('uses one versioned key, distinct from the retired theme slot key', () => {
    expect(MODE_KEY).toBe('linkedia:modo:v1');
    expect(LEGACY_THEME_KEY).toBe('linkedia:tema');
  });
});

describe('pre-paint bootstrap (public/modo.js)', () => {
  it('applies a stored pick, reading the same key as the module', () => {
    for (const m of MODES) {
      const { attrs, reads } = bootstrap(m);
      expect(attrs).toEqual({ 'data-mode': m });
      expect(reads).toEqual([MODE_KEY]);
    }
  });

  it('sets nothing for no pick, an invalid value or blocked storage', () => {
    for (const bad of [null, '', 'auto', 'BLACK', 'current', '<img onerror=x>']) expect(bootstrap(bad).attrs).toEqual({});
    expect(bootstrap('black', { throws: true }).attrs).toEqual({});
  });

  it('stays a tiny classic script: no module syntax, no globals, no network', () => {
    expect(BOOTSTRAP).toMatch(/^\/\/[\s\S]*\(function \(\) \{[\s\S]*\}\)\(\);\n$/);
    expect(BOOTSTRAP).not.toMatch(/\b(import|export|fetch|eval|innerHTML|document\.write)\b/);
    expect(Buffer.byteLength(BOOTSTRAP.replace(/^\/\/.*\n/gm, ''))).toBeLessThanOrEqual(400);
  });
});
