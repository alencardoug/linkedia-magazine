// scripts/css-modes.mjs (V2-06b): one `@mode` block → the explicit pick and the system default, same specificity.
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { cssModes, prefixSelector } from '../scripts/css-modes.mjs';

// Compared without whitespace: only the selectors and the nesting matter here.
const squash = (css) => css.replace(/\s+/g, '');
const run = (css) => squash(postcss([cssModes()]).process(css, { from: undefined }).css);

describe('css modes', () => {
  it('prefixes :root itself and any other selector as a descendant', () => {
    expect(prefixSelector(':root', 'P')).toBe('P');
    expect(prefixSelector(':root body', 'P')).toBe('P body');
    expect(prefixSelector(':root :is(h1, h2)', 'P')).toBe('P :is(h1, h2)');
    expect(prefixSelector('[data-card] h2 a', 'P')).toBe('P [data-card] h2 a');
  });

  it('expands a block to the explicit pick and to the system scheme without a pick, nested at-rules kept', () => {
    const out = run(
      '@mode dark { :root { --bg: #000 } main, [data-brand] { color: red } @media (forced-colors: active) { body::before { display: none } } }',
    );
    expect(out).toBe(
      squash(
        ":root[data-mode='dark'] { --bg: #000 } :root[data-mode='dark'] main, :root[data-mode='dark'] [data-brand] { color: red } " +
          "@media (forced-colors: active) { :root[data-mode='dark'] body::before { display: none } } " +
          '@media (prefers-color-scheme: dark) { :root:not([data-mode]) { --bg: #000 } :root:not([data-mode]) main, :root:not([data-mode]) [data-brand] { color: red } ' +
          '@media (forced-colors: active) { :root:not([data-mode]) body::before { display: none } } }',
      ),
    );
  });

  it('refuses an unknown mode (black is the base, never a block) and keyframes inside a block', () => {
    expect(() => run('@mode black { a { color: red } }')).toThrow(/@mode desconhecido/);
    expect(() => run('@mode light { @keyframes x { to { opacity: 1 } } }')).toThrow(/@keyframes fora de @mode/);
  });
});
