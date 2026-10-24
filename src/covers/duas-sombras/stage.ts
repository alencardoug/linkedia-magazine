// The gallery's camera (pure, unit-tested in tests/duas-sombras.test.mjs). It looks into the corner along the
// diagonal, a little from above, and is fitted to the art's shape so that both shadows stay inside the frame at every
// reach of the sculpture. A lens shift centres what it frames, so no part of the art is wasted.
import { REACH } from './motion';
import { ORIGIN, VOLUME, W_DIA, W_IA } from './sculpture';

export type V3 = [number, number, number];

export interface Camera {
  eye: V3;
  fwd: V3;
  right: V3;
  up: V3;
  /** Half height of the frame at distance 1. */
  tan: number;
  /** Lens shift at distance 1 (right, up). */
  shift: [number, number];
}

const TARGET: V3 = [1.85, ORIGIN.y + 0.45, 1.85];
const DISTANCE = 11;
const HEIGHT = 3;
const MARGIN = 1.06;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** What must stay in the frame: each word (with a rim of its light) at every corner of the reach, and the sculpture. */
function keyPoints(): V3[] {
  const pts: V3[] = [];
  const m = 0.22;
  for (const u of [-REACH[0], REACH[0]]) {
    for (const v of [-REACH[1], REACH[1]]) {
      const sx = u * Math.SQRT1_2;
      const sz = -u * Math.SQRT1_2;
      for (const y of [ORIGIN.y + v - m, ORIGIN.y + 1 + v + m]) {
        pts.push([0, y, ORIGIN.z + sz - m], [0, y, ORIGIN.z + W_IA + sz + m]); // "IA" on the left wall
        pts.push([ORIGIN.x + sx - m, y, 0], [ORIGIN.x + W_DIA + sx + m, y, 0]); // "DIA" on the right wall
      }
      for (const x of [VOLUME.lo[0], VOLUME.hi[0]]) {
        for (const z of [VOLUME.lo[2], VOLUME.hi[2]]) pts.push([x + sx, VOLUME.lo[1] + v - 0.15, z + sz]);
      }
    }
  }
  return pts;
}
const KEY_POINTS = keyPoints();

/** The camera for an art of this aspect ratio (width / height). */
export function fitCamera(aspect: number): Camera {
  const eye: V3 = [TARGET[0] + DISTANCE * Math.SQRT1_2, TARGET[1] + HEIGHT, TARGET[2] + DISTANCE * Math.SQRT1_2];
  const fwd = norm(sub(TARGET, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of KEY_POINTS) {
    const v = sub(p, eye);
    const z = dot(v, fwd);
    const x = dot(v, right) / z;
    const y = dot(v, up) / z;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const tan = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / Math.max(aspect, 1e-3)) * MARGIN;
  return { eye, fwd, right, up, tan, shift: [(x0 + x1) / 2, (y0 + y1) / 2] };
}

/** Where a world point lands in the frame (−1 … 1 on each axis inside it, y up). */
export function project(cam: Camera, p: readonly number[], aspect: number): [number, number] {
  const v = sub([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], cam.eye);
  const z = dot(v, cam.fwd);
  return [(dot(v, cam.right) / z - cam.shift[0]) / (cam.tan * aspect), (dot(v, cam.up) / z - cam.shift[1]) / cam.tan];
}
