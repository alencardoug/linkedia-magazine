// The line field of the "Sismograma" cover (pure, unit-tested in tests/sismograma.test.mjs): how many lines, where
// they rest, and what moves them — the breathing, the "IA" relief, ripples, the soft limit that keeps the lines
// parallel and the lens under each pointer. Units are CSS pixels and seconds; `S` is the spacing between baselines.
// Values come from the owner's brief of 2026-11-11 (proposal P10) and are frozen here.
import type { Noise3 } from './noise';

export const TAU = Math.PI * 2;
/** 1: the lines rise in relief and write "IA"; 0: the pure sheet of the brief (nothing else changes). */
export const RELIEF: number = 1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 15 lines plus one per article of the edition, at most 25. */
export const lineCount = (articles: number): number => clamp(15 + (Number.isFinite(articles) ? Math.trunc(articles) : 0), 15, 25);

/** Distance between points along a line: 8 px at full quality, up to 16 px on a slow device. */
export const pointStep = (scale: number): number => clamp(8 / Math.max(scale, 1e-3), 8, 16);

export interface Rows {
  /** Spacing between baselines. */
  S: number;
  /** Baseline of line `i`. */
  y: (i: number) => number;
}

/** `n` baselines evenly spaced between `top` and `bottom`, with ¾ of a spacing free above and below. */
export function rows(top: number, bottom: number, n: number): Rows {
  const S = Math.max(1, bottom - top) / (n + 0.5);
  return { S, y: (i) => top + S * (i + 0.75) };
}

/** The autonomous movement at `x` of line `i` at time `t`, in units of `S`: two slow sines, a wide noise and the
 * plotter's small irregularity, all swelling and ebbing every 11 s. */
export function breathing(noise: Noise3, x: number, i: number, t: number, W: number): number {
  return (
    (0.22 * Math.sin((TAU * x) / (0.9 * W) - 0.35 * t + 0.42 * i) +
      0.1 * Math.sin((TAU * x) / (0.37 * W) + 0.21 * t + 0.71 * i) +
      0.3 * noise(x / 260, 0.35 * i, t / 9) +
      0.035 * noise(x / 38, 3.1 * i, t / 5)) *
    (0.8 + 0.2 * Math.sin((TAU * t) / 11))
  );
}

/** Lift of a point whose smoothed mask value is `relief` (0…1): up, between 0.35 and 0.6 of a spacing over 18 s.
 * Near half a spacing the lines inside a letter sit between the lines outside it, which is where the letter reads
 * best; a lift near a whole spacing would put them back in step with the lines outside. */
export const reliefLift = (S: number, relief: number, t: number): number =>
  -0.6 * S * relief * (0.79 + 0.21 * Math.sin((TAU * t) / 18));
/** Inside a letter the breathing is this much calmer, so the letter keeps its edges. */
export const RELIEF_CALM = 0.45;
/** The time at which the relief is highest: the still frame. */
export const STILL_T = 4.5;

/** Box filter of radius `r` points, applied twice, over each of the `n` rows of `m` points. */
export function smoothRows(raw: Float32Array, n: number, m: number, r: number): Float32Array {
  let from = raw;
  for (let pass = 0; pass < 2; pass++) {
    const to = new Float32Array(n * m);
    for (let i = 0; i < n; i++) {
      const row = i * m;
      for (let k = 0; k < m; k++) {
        let sum = 0;
        const a = Math.max(0, k - r);
        const b = Math.min(m - 1, k + r);
        for (let j = a; j <= b; j++) sum += from[row + j]!;
        to[row + k] = sum / (2 * r + 1); // beyond the ends the mask is empty
      }
    }
    from = to;
  }
  return from;
}

export interface Ripple {
  x: number;
  y: number;
  /** Birth, in the art's seconds. */
  t0: number;
  /** Amplitude in pixels. */
  C: number;
  /** Speed of the ring, px/s. */
  speed: number;
}

export const RIPPLE_SPEED = 420;
export const RIPPLE_LIFE = 3;
export const RIPPLE_MAX = 10;
/** Amplitudes in units of `S`: a long press, one step of a drag (every DRAG_RIPPLE_PX), the entry. */
export const PRESS_C = 1.1;
export const DRAG_C = 0.45;
export const EXIT_C = 2.2;
export const EXIT_SPEED = 1400;
/** How much of a ripple also pulls on the springs, which answer late: the wake that rings behind the ring. */
export const RIPPLE_WAKE = 0.6;
const BAND = 90;
const FADE = 1.4;

/** Radians per pixel inside the packet are 1 / rippleWave: 28 px, more on a widely spaced sheet, so that two
 * neighbouring lines are never more than a spacing apart in the wave and do not cross. */
export const rippleWave = (S: number): number => Math.max(28, 1.2 * S);

/** Displacement a ripple of amplitude `C` and ring speed `speed` gives, at `age` seconds, to a point `d` px from its
 * origin: a damped wave packet riding the ring. */
export function rippleAt(C: number, speed: number, age: number, d: number, wave = 28): number {
  if (age < 0 || age > RIPPLE_LIFE) return 0;
  const q = (d - speed * age) / BAND;
  if (q * q > 12) return 0; // under 1e-5 of the amplitude
  return C * Math.exp(-age / FADE) * Math.exp(-q * q) * Math.cos((d - speed * age) / wave);
}

/** Keeps the newest RIPPLE_MAX ripples that are still alive at `t`. */
export function addRipple(list: Ripple[], ripple: Ripple, t: number): Ripple[] {
  const alive = list.filter((r) => t - r.t0 <= RIPPLE_LIFE);
  alive.push(ripple);
  return alive.slice(-RIPPLE_MAX);
}

/** The parallel structure survives any input: whatever is asked, a line moves less than 0.95 · S. */
export function softLimit(g: number, S: number): number {
  const lim = 0.95 * S;
  return lim * Math.tanh(g / lim);
}

export const lensSigma = (W: number): number => (W < 600 ? 90 : 110);

/** Strength of the lens under a pointer moving at `speed` px/s: about one spacing at rest (never less than a quarter
 * of sigma, so a tight sheet still opens), up to 2.8 times that at 1500 px/s, bounded so lines never cross. */
export const lensStrength = (S: number, speed: number, sigma: number): number =>
  Math.min(Math.max(S, 0.26 * sigma) * (1 + 1.8 * clamp(speed / 1500, 0, 1)), 1.2 * sigma);

/** The lens at a point `dx`, `dy` from the pointer (`dy` < 0: the point is above it): lines above go up and lines
 * below go down, so an eye opens under the pointer. Zero on the pointer's row, it reaches most of `B` within half a
 * sigma (a line snaps from one side to the other as the pointer crosses it, like a plucked string) and fades as a
 * Gaussian. For B ≤ 1.2 · sigma the map y → y + lens stays increasing: lines bunch around the eye, never cross. */
export function lens(B: number, sigma: number, dx: number, dy: number): number {
  const e = (dx * dx + dy * dy) / (2 * sigma * sigma);
  if (e > 9) return 0;
  return B * Math.tanh(dy / (0.25 * sigma)) * Math.exp(-e);
}

/** Entry after a click or tap (docs/COVERS.md: at most ~1 s). */
export const EXIT_MS = 700;

/** The entry erases the sheet in a disc that grows from the tap and passes `reach`, the farthest corner, at EXIT_MS;
 * the lines fade across EXIT_SOFT px inside its rim. */
export const EXIT_SOFT = 220;
export const exitRadius = (ms: number, reach: number): number => clamp(ms / EXIT_MS, 0, 1) * (reach + EXIT_SOFT);
/** Ring speed of the entry ripple: at least EXIT_SPEED, and fast enough to ride the rim of the erased disc. */
export const exitSpeed = (reach: number): number => Math.max(EXIT_SPEED, ((reach + EXIT_SOFT) * 1000) / EXIT_MS);

/** The pen: at birth each line is plotted from left to right, one line starting after the other. */
const PEN_LINE_S = 1.1;
const PEN_STAGGER_S = 0.035;
/** Fraction (0…1) of line `i` already plotted `pen` seconds after the pen started. */
export function penReach(pen: number, i: number): number {
  const e = clamp((pen - PEN_STAGGER_S * i) / PEN_LINE_S, 0, 1);
  return 1 - (1 - e) ** 3;
}
/** Seconds the pen takes to plot `n` lines. */
export const penDone = (n: number): number => PEN_STAGGER_S * Math.max(0, n - 1) + PEN_LINE_S;
