// Motion of "Duas sombras" (pure, unit-tested in tests/duas-sombras.test.mjs): the sculpture follows the pointer or
// the finger as one rigid body and leans a little against its acceleration, wanders when nobody steers, the lamps
// light the two words one after the other, and on entry the shadows swallow the room. Positions are in cap heights:
// u along the walls' diagonal (screen-horizontal), v up.

export type Vec = readonly [number, number];

/** Without pointer movement for this long, the sculpture wanders on its own again. */
export const IDLE_AFTER_MS = 3500;
/** How far the sculpture travels from home (u, v). */
export const REACH: Vec = [0.5, 0.3];
const FOLLOW = { stiffness: 14, damping: 6.5 };
/** Most it leans (radians): beyond about 4 degrees the two words smear into blocks. */
const MAX_YAW = 0.06;
const MAX_PITCH = 0.045;

export interface Body {
  pos: Vec;
  vel: Vec;
  /** Smoothed acceleration, for the lean. */
  acc: Vec;
}

export const restBody = (): Body => ({ pos: [0, 0], vel: [0, 0], acc: [0, 0] });

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/** Pointer position in the art (−1 … 1 on each axis, y down) → where the sculpture goes. */
export function pointerTarget(nx: number, ny: number): Vec {
  return [clamp(nx, -1, 1) * REACH[0], -clamp(ny, -1, 1) * REACH[1]];
}

/** One semi-implicit Euler step of the damped spring pulling the sculpture toward `target`; `dt` in seconds. */
export function followStep(b: Body, target: Vec, dt: number): Body {
  const h = clamp(dt, 0, 0.05);
  const ax = (target[0] - b.pos[0]) * FOLLOW.stiffness - b.vel[0] * FOLLOW.damping;
  const ay = (target[1] - b.pos[1]) * FOLLOW.stiffness - b.vel[1] * FOLLOW.damping;
  const vel: Vec = [b.vel[0] + ax * h, b.vel[1] + ay * h];
  const k = Math.min(1, h * 10);
  return {
    pos: [b.pos[0] + vel[0] * h, b.pos[1] + vel[1] * h],
    vel,
    acc: [b.acc[0] + (ax - b.acc[0]) * k, b.acc[1] + (ay - b.acc[1]) * k],
  };
}

/** A hanging mass leans against its acceleration: small yaw and pitch (radians). */
export function leanOf(b: Body): { yaw: number; pitch: number } {
  return { yaw: clamp(-b.acc[0] * 0.012, -MAX_YAW, MAX_YAW), pitch: clamp(b.acc[1] * 0.01, -MAX_PITCH, MAX_PITCH) };
}

/** Slow Lissajous drift while nobody steers; it widens over the first seconds of idling. */
export function wander(idleSeconds: number, seconds: number): Vec {
  const reach = clamp(idleSeconds / 6, 0, 1);
  return [0.7 * REACH[0] * Math.sin(seconds * 0.21) * reach, 0.4 * REACH[1] * Math.sin(seconds * 0.33) * reach];
}

const ramp = (ms: number, from: number, to: number): number => clamp((ms - from) / (to - from), 0, 1);

/** Birth: the left lamp ("IA") comes on first, then the right one ("DIA"). Returns [right, left], 0 … 1. */
export function lamps(msSinceStart: number): Vec {
  return [ramp(msSinceStart, 750, 1150), ramp(msSinceStart, 150, 550)];
}

/** Birth: position of the glaze highlight that runs once along the blades. */
export function sweep(msSinceStart: number): number {
  return -1 + 5.5 * ramp(msSinceStart, 1000, 2600);
}

/** Exit after a click: the lamp rushes toward the sculpture, the shadows swell until the strokes meet, the frame
 * fades to dark, then the page navigates. */
export const EXIT_MS = 700;
/** Most the shadows swell (cap heights): kept inside the range the baked word fields store (shaders.ts BAKE_RANGE). */
export const MAX_SWELL = 0.27;
export function exitState(msSinceExit: number): { swell: number; approach: number; fade: number; done: boolean } {
  const x = clamp(msSinceExit / EXIT_MS, 0, 1);
  return { swell: MAX_SWELL * x ** 3, approach: x * x, fade: 1 - clamp((x - 0.55) / 0.45, 0, 1), done: msSinceExit >= EXIT_MS };
}
