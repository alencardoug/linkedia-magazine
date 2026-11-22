// Shared by the browser specs.
import { inflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { MODE_KEY } from '../src/lib/mode.ts';

/** Page errors and console errors seen from now on (`ignore` drops expected console messages). */
export function watchErrors(page, ignore = /$^/) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** Stores a reading-mode pick (V2-06) before every navigation of this page. */
export const presetMode = (page, value) => page.addInitScript(([k, v]) => localStorage.setItem(k, v), [MODE_KEY, value]);

/** The painted colour of one viewport pixel, as `rgb(r, g, b)`, read from a real screenshot (a 1×1 PNG). */
export async function pixel(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, animations: 'disabled' });
  const chunks = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  // One pixel: whatever the row filter, with no neighbours the bytes after the filter byte are the raw values.
  const [, r, g, b] = inflateSync(Buffer.concat(chunks));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Serious and critical axe violations, as `rule: targets`. */
export async function axeBlocking(page, include) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

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
