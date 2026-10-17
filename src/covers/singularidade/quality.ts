// Adaptive resolution of the "Singularidade" renderer (pure, unit-tested). The scene renders at `scale` × the
// canvas size; frame intervals steer the scale between MIN_SCALE and MAX_SCALE, and a device that stays too slow
// at MIN_SCALE gets a still frame instead of a stuttering loop (the floor: the art never locks a weak device up).

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 1;
/** Pixels the first frames aim at; an Intel HD 620 laptop GPU holds 60 fps at about 0.45 MP. */
export const START_PIXELS = 500_000;

const SLOW_MS = 24; // under ~42 fps: step down
const STILL_MS = 45; // under ~22 fps at the minimum scale: give up animating
const FAST_MS = 18; // at vsync on a 60 Hz screen (or faster): may step up
const STALL_MS = 250; // one frame this long while visible (the loop pauses when hidden) is a stall
/** Two stalls within this window: keep a still frame. */
const STALL_WINDOW_MS = 3000;

export interface Quality {
  scale: number;
  /** Exponential moving average of the frame interval, ms. */
  ema: number;
  slowSince: number | null;
  fastSince: number | null;
  lastChange: number;
  still: boolean;
  /** Time of the last stall, ms (−Infinity: none yet). */
  lastStall: number;
}

/** Scale whose render target holds about `budget` pixels for this canvas (CSS size × pixel ratio). */
export function initialScale(cssWidth: number, cssHeight: number, pixelRatio: number, budget = START_PIXELS): number {
  const pixels = Math.max(1, cssWidth * cssHeight * pixelRatio * pixelRatio);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.sqrt(budget / pixels)));
}

export function createQuality(scale: number, now: number): Quality {
  return { scale, ema: 16.7, slowSince: null, fastSince: null, lastChange: now, still: false, lastStall: -Infinity };
}

/**
 * Feeds one frame interval; returns the next state (scale changes at most every 0.7 s down, 3 s up). The caller
 * pauses the loop while the page is hidden, so a very long interval is the device stalling: one is forgiven (a
 * hiccup), a second within 3 s keeps a still frame.
 */
export function observeFrame(q: Quality, intervalMs: number, now: number): Quality {
  if (q.still || !(intervalMs > 0)) return q;
  if (intervalMs > STALL_MS) {
    return { ...q, still: now - q.lastStall < STALL_WINDOW_MS, lastStall: now };
  }
  const ema = q.ema * 0.9 + intervalMs * 0.1;
  const next: Quality = { ...q, ema };
  if (ema > SLOW_MS) {
    next.fastSince = null;
    next.slowSince = q.slowSince ?? now;
    if (q.scale <= MIN_SCALE && ema > STILL_MS && now - next.slowSince > 2000) return { ...next, still: true };
    if (now - next.slowSince > 700 && now - q.lastChange > 700 && q.scale > MIN_SCALE) {
      return { ...next, scale: Math.max(MIN_SCALE, q.scale * 0.82), lastChange: now, slowSince: now };
    }
  } else if (ema < FAST_MS) {
    next.slowSince = null;
    next.fastSince = q.fastSince ?? now;
    if (now - next.fastSince > 3000 && now - q.lastChange > 3000 && q.scale < MAX_SCALE) {
      return { ...next, scale: Math.min(MAX_SCALE, q.scale * 1.1), lastChange: now, fastSince: now };
    }
  } else {
    next.slowSince = null;
    next.fastSince = null;
  }
  return next;
}

/** Most a frame may take at the minimum scale during the start-up measurement before the art gives up. */
export const START_MAX_MS = 80;
const START_TARGET_MS = 12;

/**
 * Start-up calibration: from the measured cost of one frame at MIN_SCALE, the scale whose frames should take about
 * 12 ms (cost grows with the pixel count, the square of the scale), never above `limit`; null when the device is too
 * slow to animate at all.
 */
export function calibratedScale(costAtMinMs: number, limit: number): number | null {
  if (!(costAtMinMs >= 0) || costAtMinMs > START_MAX_MS) return null;
  const scale = MIN_SCALE * Math.sqrt(START_TARGET_MS / Math.max(costAtMinMs, 0.25));
  return Math.min(Math.max(scale, MIN_SCALE), limit, MAX_SCALE);
}
