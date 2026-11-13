// The two cyan measuring markers of the "Sismograma" cover (pure, unit-tested in tests/sismograma.test.mjs). Each is
// a damped spring along x (3 rad/s, damping ratio 0.7) around its rest position: a pointer nearby pushes it away, a
// passing ripple kicks it, and it never travels more than EXCURSION from rest.

/** Rest positions as fractions of the width. */
export const MARKER_REST: readonly number[] = [0.24, 0.76];
export const MARKER_LABELS: readonly string[] = ['A', 'B'];
export const EXCURSION = 60;
const OMEGA = 3;
const RATIO = 0.7;
const REACH = 140;
const PUSH = 900;
const KICK = 30;

export interface Marker {
  rest: number;
  x: number;
  v: number;
}

export const createMarkers = (W: number): Marker[] => MARKER_REST.map((f) => ({ rest: f * W, x: f * W, v: 0 }));

/**
 * One step of a marker. `pointers`: x of every active pointer with its weight (0…1); `ripple`: the displacement the
 * ripples give at the marker, in pixels.
 */
export function stepMarker(m: Marker, pointers: readonly (readonly [number, number])[], ripple: number, dt: number): void {
  const h = Math.min(Math.max(dt, 0), 1 / 30);
  let a = -OMEGA * OMEGA * (m.x - m.rest) - 2 * RATIO * OMEGA * m.v + KICK * ripple;
  for (const [px, weight] of pointers) {
    const dx = m.x - px;
    const d = Math.abs(dx);
    if (d < REACH) a += (dx < 0 ? -1 : 1) * PUSH * weight * (1 - d / REACH);
  }
  m.v += a * h;
  m.x += m.v * h;
  const lo = m.rest - EXCURSION;
  const hi = m.rest + EXCURSION;
  if (m.x < lo) {
    m.x = lo;
    m.v = Math.max(0, m.v);
  } else if (m.x > hi) {
    m.x = hi;
    m.v = Math.min(0, m.v);
  }
}

/** `A 0.310`: the marker's position as a fraction of the width. */
export const readout = (label: string, x: number, W: number): string => `${label} ${(x / Math.max(1, W)).toFixed(3)}`;
