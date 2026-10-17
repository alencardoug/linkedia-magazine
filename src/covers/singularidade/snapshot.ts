// The HTML cover painted into a Canvas 2D bitmap for the renderer. Every grapheme of the `data-ink` elements is drawn
// where the browser laid it out (Range rects, computed font, colour and opacity), so the first WebGL frame matches the
// page before the hole appears and CSS keeps owning the responsive layout. Hooks: `data-ink-rule` (its top/bottom
// borders, colour from --ink-rule), `data-ink-gradient` (text filled from --ink-from to --ink-to across the element),
// `data-anchor` (where the hole is born). Live mode hides the DOM ink with -webkit-text-fill-color only, so computed
// colours stay readable here when a resize repaints.

export interface CoverBitmap {
  canvas: HTMLCanvasElement;
  /** CSS pixels covered by the bitmap (the viewport). */
  width: number;
  height: number;
  /** Centre of the `data-anchor` element, CSS pixels. */
  anchor: [number, number];
}

/** Bitmap pixels per CSS pixel: sharp text near the hole's magnification, within a memory budget. */
export function bitmapScale(cssWidth: number, cssHeight: number, pixelRatio: number, maxPixels = 3_000_000): number {
  const side = 4096 / Math.max(cssWidth, cssHeight, 1);
  const area = Math.sqrt(maxPixels / Math.max(cssWidth * cssHeight, 1));
  return Math.max(0.5, Math.min(pixelRatio * 1.25, side, area));
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

function graphemes(text: string): { segment: string; index: number }[] {
  if (segmenter) return [...segmenter.segment(text)].map(({ segment, index }) => ({ segment, index }));
  const out: { segment: string; index: number }[] = [];
  let index = 0;
  for (const segment of text) {
    out.push({ segment, index });
    index += segment.length;
  }
  return out;
}

function opacity(el: Element, root: Element): number {
  let alpha = 1;
  for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
    alpha *= Number.parseFloat(getComputedStyle(node).opacity) || 0;
  }
  return alpha;
}

function paintRules(g: CanvasRenderingContext2D, root: Element): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-ink-rule]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    g.fillStyle = cs.getPropertyValue('--ink-rule').trim() || cs.color;
    const top = Number.parseFloat(cs.borderTopWidth) || 0;
    const bottom = Number.parseFloat(cs.borderBottomWidth) || 0;
    if (top > 0) g.fillRect(r.left, r.top, r.width, top);
    if (bottom > 0) g.fillRect(r.left, r.bottom - bottom, r.width, bottom);
  }
}

function paintText(g: CanvasRenderingContext2D, root: Element): void {
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    const text = node.textContent ?? '';
    if (!el || !el.closest('[data-ink]') || !text.trim()) continue;
    const cs = getComputedStyle(el);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.globalAlpha = opacity(el, root);
    const gradientHost = el.closest<HTMLElement>('[data-ink-gradient]');
    if (gradientHost) {
      const r = gradientHost.getBoundingClientRect();
      const hostStyle = getComputedStyle(gradientHost);
      const fill = g.createLinearGradient(r.left, 0, r.right, 0);
      fill.addColorStop(0, hostStyle.getPropertyValue('--ink-from').trim() || cs.color);
      fill.addColorStop(1, hostStyle.getPropertyValue('--ink-to').trim() || cs.color);
      g.fillStyle = fill;
    } else {
      g.fillStyle = cs.color;
    }
    const upper = cs.textTransform === 'uppercase';
    const ascent = g.measureText('Hg').fontBoundingBoxAscent;
    for (const { segment, index } of graphemes(text)) {
      if (!segment.trim()) continue;
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rect = range.getClientRects()[0];
      if (!rect || rect.width === 0) continue;
      g.fillText(upper ? segment.toLocaleUpperCase('pt-BR') : segment, rect.left, rect.top + ascent);
    }
  }
  g.globalAlpha = 1;
}

/** Paints `root` as it is laid out now, on its computed background colour, at `scale` bitmap pixels per CSS pixel. */
export function paintCover(root: HTMLElement, scale: number): CoverBitmap {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const g = canvas.getContext('2d', { alpha: false });
  if (!g) throw new Error('Canvas 2D indisponível');
  g.scale(canvas.width / width, canvas.height / height);
  g.fillStyle = getComputedStyle(document.body).backgroundColor;
  g.fillRect(0, 0, width, height);
  g.textBaseline = 'alphabetic';
  paintRules(g, root);
  paintText(g, root);
  const a = root.querySelector('[data-anchor]')?.getBoundingClientRect();
  const anchor: [number, number] = a ? [a.left + a.width / 2, a.top + a.height * 0.52] : [width / 2, height / 2];
  return { canvas, width, height, anchor };
}
