// The elastic state of the "Sismograma" cover (pure, unit-tested in tests/sismograma.test.mjs). Every point of every
// line has a displacement `u` and a velocity `v`; a damped spring pulls it to its goal (9 rad/s, damping ratio 0.55:
// the elastic return) and a second spring ties it to the same point of the lines above and below, so the lines react
// to each other. Arrays are row-major: `n` lines of `m` points.

export const STIFFNESS = 81;
export const DAMPING = 9.9;
export const COUPLING = 30;
/** Longest step integrated at once; a slower device runs the sheet in slow motion instead of blowing it up. */
export const MAX_DT = 1 / 30;

/** One semi-implicit Euler step: every velocity from the current displacements, then every displacement. */
export function stepSprings(u: Float32Array, v: Float32Array, goal: Float32Array, n: number, m: number, dt: number): void {
  const h = Math.min(Math.max(dt, 0), MAX_DT);
  const last = (n - 1) * m;
  for (let row = 0; row <= last; row += m) {
    for (let k = 0; k < m; k++) {
      const j = row + k;
      const here = u[j]!;
      const above = row > 0 ? u[j - m]! : here; // the first and the last line have one neighbour
      const below = row < last ? u[j + m]! : here;
      v[j] = v[j]! + (STIFFNESS * (goal[j]! - here) - DAMPING * v[j]! + COUPLING * (above + below - 2 * here)) * h;
    }
  }
  const size = n * m;
  for (let j = 0; j < size; j++) u[j] = u[j]! + v[j]! * h;
}

/** Mechanical energy of the sheet: kinetic, the springs to the goals and the springs between lines. */
export function energy(u: Float32Array, v: Float32Array, goal: Float32Array, n: number, m: number): number {
  let e = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < m; k++) {
      const j = i * m + k;
      const d = u[j]! - goal[j]!;
      e += 0.5 * v[j]! * v[j]! + 0.5 * STIFFNESS * d * d;
      if (i + 1 < n) {
        const s = u[j + m]! - u[j]!;
        e += 0.5 * COUPLING * s * s;
      }
    }
  }
  return e;
}

/** Linear resampling of each row from `from` points to `to` points (the point step changed with the quality). */
export function resampleRows(values: Float32Array, n: number, from: number, to: number): Float32Array {
  const out = new Float32Array(n * to);
  if (from < 2 || to < 2) return out;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < to; k++) {
      const f = (k * (from - 1)) / (to - 1);
      const a = Math.min(from - 2, Math.floor(f));
      const w = f - a;
      out[i * to + k] = values[i * from + a]! * (1 - w) + values[i * from + a + 1]! * w;
    }
  }
  return out;
}
