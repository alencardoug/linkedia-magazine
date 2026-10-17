// Shared by the theme specs (fixture and real themes).
import AxeBuilder from '@axe-core/playwright';

export const KEY = 'linkedia:tema';

/** Page errors and console errors seen from now on (`ignore` drops expected console messages). */
export function watchErrors(page, ignore = /$^/) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** Sets the stored slot before every navigation of this page. */
export const preset = (page, value) => page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, value]);

/** Serious and critical axe violations, as `rule: targets`. */
export async function axeBlocking(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** A device without WebGL: every webgl/webgl2 context request returns null. */
export const withoutWebgl = (page) =>
  page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(type) ? null : getContext.call(this, type, ...rest);
    };
  });

/**
 * A device with WebGL. Headless Chromium has none (not even with SwiftShader flags), so webgl/webgl2 requests get
 * a stand-in context: enough for the runtime's capability check, not for drawing.
 */
export const withWebgl = (page) =>
  page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(type) ? { getExtension: () => null } : getContext.call(this, type, ...rest);
    };
  });

/** Sum of layout-shift scores without recent input since navigation (CLS of a short visit). */
export const layoutShift = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
        requestAnimationFrame(() => setTimeout(() => resolve(total), 50));
      }),
  );
