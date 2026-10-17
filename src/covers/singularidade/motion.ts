// Motion of the "Singularidade" cover (pure, unit-tested in tests/covers.test.mjs): the hole's birth on the masthead,
// the spring that makes it follow the pointer or finger, its idle wander, the ripple and the exit that swallows the
// screen. Positions are CSS pixels of the viewport; the renderer converts them to its image units.

export type Vec = readonly [number, number];

export const BIRTH_DELAY_MS = 600;
export const BIRTH_MS = 2300;
export const EXIT_MS = 900;
/** Without pointer movement for this long, the hole wanders on its own again. */
export const IDLE_AFTER_MS = 3500;

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
export const easeOutCubic = (x: number): number => 1 - (1 - clamp01(x)) ** 3;

/** Size of the hole (Schwarzschild radius scale) while it condenses from a point: 0 → 1. */
export function birthScale(msSinceStart: number): number {
  return easeOutCubic((msSinceStart - BIRTH_DELAY_MS) / BIRTH_MS);
}

/** How far the dots have turned from the CSS cover's look into the animated field: 0 → 1 during the birth. */
export function vividness(msSinceStart: number): number {
  return clamp01((msSinceStart - BIRTH_DELAY_MS) / 1800);
}

/** The accretion disk lights up after gravity has started bending the letters: 0 → 1. */
export function diskLevel(msSinceStart: number): number {
  return easeOutCubic((msSinceStart - BIRTH_DELAY_MS - 500) / 1500);
}

/** Exit after a click: the hole grows until the camera is inside it, the frame fades, then the page navigates. */
export function exitState(msSinceExit: number): { rs: number; fade: number; done: boolean } {
  const y = msSinceExit / EXIT_MS;
  const grow = clamp01((y - 0.12) / 0.88);
  return { rs: 1 + 44 * grow ** 3, fade: 1 - clamp01((y - 0.78) / 0.22), done: y >= 1 };
}

export interface Spring {
  stiffness: number;
  damping: number;
}
/** Following the pointer (the feel the owner chose in the prototype) and rushing to the click point on exit. */
export const FOLLOW: Spring = { stiffness: 9, damping: 5 };
export const RUSH: Spring = { stiffness: 40, damping: 12 };

/** One semi-implicit Euler step of a damped spring pulling `pos` toward `target`; `dt` in seconds (capped). */
export function springStep(pos: Vec, vel: Vec, target: Vec, spring: Spring, dt: number): [Vec, Vec] {
  const h = Math.min(dt, 0.05);
  const ax = (target[0] - pos[0]) * spring.stiffness - vel[0] * spring.damping;
  const ay = (target[1] - pos[1]) * spring.stiffness - vel[1] * spring.damping;
  const v: Vec = [vel[0] + ax * h, vel[1] + ay * h];
  return [[pos[0] + v[0] * h, pos[1] + v[1] * h], v];
}

/** Slow Lissajous drift around `home` while nobody steers; it widens over the first seconds of idling. */
export function wander(home: Vec, idleSeconds: number, height: number): Vec {
  const reach = clamp01(idleSeconds / 8);
  return [
    home[0] + 0.16 * height * Math.sin(idleSeconds * 0.17) * reach,
    home[1] + 0.06 * height * Math.sin(idleSeconds * 0.29) * reach,
  ];
}

/** A gravitational-wave ripple: its front runs outward at `speed` px/ms while its amplitude decays. */
export function ripple(msSince: number, amplitude: number, speed = 0.7): { radius: number; amplitude: number } {
  if (msSince < 0) return { radius: 0, amplitude: 0 };
  return { radius: msSince * speed, amplitude: amplitude * Math.exp(-msSince / 900) };
}
