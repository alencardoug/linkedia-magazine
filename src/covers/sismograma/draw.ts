// Drawing of the "Sismograma" sheet on a Canvas 2D context: the lines as smooth curves through the midpoints of
// their points, the magenta stretches inside the letters of the relief, the code beside each line, the two cyan
// markers with their readouts, the pen that plots the sheet at birth and the disc that erases it on entry.
// Coordinates are CSS pixels; `ratio` maps them to the backing store.
import { INK_MARKER, INK_RELIEF } from './codes';
import { EXIT_SOFT, penReach } from './field';
import { MARKER_LABELS, readout } from './markers';

const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
const LINE_WIDTH = 1.1;
const LINE_ALPHA = 0.9;
const RELIEF_WIDTH = 1.9;
const CODE_INK = 'rgba(46,22,80,.72)';
const CODE_EDGE = 16;

export interface Sheet {
  W: number;
  H: number;
  ratio: number;
  /** `n` lines of `m` points (row-major arrays). */
  n: number;
  m: number;
  xs: Float32Array;
  base: Float32Array;
  /** Displacement of every point from its baseline, as shown. */
  u: Float32Array;
  /** 1 where the point is inside a letter of the relief. */
  hot: Uint8Array;
  inks: readonly string[];
  codes: readonly string[];
  /** A code on every line (1) or on every other line (2, narrow sheets). */
  codeEvery: number;
  /** Top and bottom of the plot: the extent of the markers. */
  top: number;
  bottom: number;
}

export interface Frame {
  /** Seconds since the pen started (Infinity: the whole sheet is plotted). */
  pen: number;
  markers: readonly { x: number }[];
  /** The disc erased from the tap during the entry. */
  erase: { x: number; y: number; r: number } | null;
}

/** Appends the curve of line `i` through points `a`…`b` (b ≥ a ≥ 1): from the midpoint before `a` to the one after `b`. */
function trace(ctx: CanvasRenderingContext2D, s: Sheet, i: number, a: number, b: number): void {
  const { xs, u, m } = s;
  const row = i * m;
  const y0 = s.base[i]!;
  ctx.moveTo((xs[a - 1]! + xs[a]!) / 2, y0 + (u[row + a - 1]! + u[row + a]!) / 2);
  for (let k = a; k <= b; k++) {
    ctx.quadraticCurveTo(xs[k]!, y0 + u[row + k]!, (xs[k]! + xs[k + 1]!) / 2, y0 + (u[row + k]! + u[row + k + 1]!) / 2);
  }
}

export function drawSheet(ctx: CanvasRenderingContext2D, s: Sheet, f: Frame): void {
  const { W, H, n, m, xs, u } = s;
  ctx.setTransform(s.ratio, 0, 0, s.ratio, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // How far the pen has plotted each line: the last point index whose curve is drawn.
  const ends = new Int32Array(n);
  for (let i = 0; i < n; i++) ends[i] = Math.min(m - 2, Math.floor(penReach(f.pen, i) * (m - 2)));

  // One path per ink.
  ctx.lineWidth = LINE_WIDTH;
  ctx.globalAlpha = LINE_ALPHA;
  for (const ink of new Set(s.inks)) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) if (s.inks[i] === ink && ends[i]! >= 1) trace(ctx, s, i, 1, ends[i]!);
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  // The stretches inside the letters, over the base stroke.
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const row = i * m;
    const end = ends[i]!;
    for (let k = 1; k <= end; k++) {
      if (!s.hot[row + k]) continue;
      const a = k;
      while (k < end && s.hot[row + k + 1]) k++;
      trace(ctx, s, i, a, k);
    }
  }
  ctx.lineWidth = RELIEF_WIDTH;
  ctx.strokeStyle = INK_RELIEF;
  ctx.stroke();

  // The pen heads while the sheet is being plotted.
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#131016';
  for (let i = 0; i < n; i++) {
    const end = ends[i]!;
    if (end < 1 || end >= m - 2) continue;
    ctx.beginPath();
    ctx.arc((xs[end]! + xs[end + 1]!) / 2, s.base[i]! + (u[i * m + end]! + u[i * m + end + 1]!) / 2, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // The codes: a right-hand column, each 3 px above its line and following half of its movement there.
  ctx.font = `9.5px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CODE_INK;
  const column = Math.max(1, Math.min(m - 2, Math.round((W - CODE_EDGE - 28 - xs[0]!) / (xs[1]! - xs[0]!))));
  for (let i = 0; i < n; i += s.codeEvery) {
    if (ends[i]! < column) continue; // the pen has not passed yet
    ctx.fillText(s.codes[i]!, W - CODE_EDGE, s.base[i]! - 3 + 0.5 * u[i * m + column]!);
  }

  // The markers and their readouts.
  const shown = Math.min(1, f.pen / 0.6);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = INK_MARKER;
  ctx.fillStyle = INK_MARKER;
  ctx.font = `10px ${MONO}`;
  f.markers.forEach((marker, j) => {
    ctx.globalAlpha = 0.85 * shown;
    ctx.beginPath();
    ctx.moveTo(marker.x, s.top);
    ctx.lineTo(marker.x, s.bottom);
    ctx.stroke();
    ctx.globalAlpha = shown;
    // The readout sits right of its marker, or left of it where it would run into the column of codes.
    const left = marker.x > W - 150;
    ctx.textAlign = left ? 'right' : 'left';
    ctx.fillText(readout(MARKER_LABELS[j] ?? '', marker.x, W), marker.x + (left ? -5 : 5), s.top + 10);
  });
  ctx.globalAlpha = 1;

  if (f.erase) {
    const { x, y, r } = f.erase;
    const fade = ctx.createRadialGradient(x, y, Math.max(0, r - EXIT_SOFT), x, y, Math.max(1, r));
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
}
