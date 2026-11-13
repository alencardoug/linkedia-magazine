// Pointers over the "Sismograma" sheet (pure, unit-tested in tests/sismograma.test.mjs): up to three at once (a
// hovering mouse counts), each with a smoothed speed, a weight that rises while it is there and decays after it
// leaves, and the distance it travelled while pressed, which earns the ripples of a drag.

export const MAX_POINTERS = 3;
/** A pressed pointer leaves one ripple every this many pixels of travel. */
export const DRAG_RIPPLE_PX = 90;
/** After release the lens fades as exp(−t / RELEASE_S). */
export const RELEASE_S = 0.6;
const ARRIVE_S = 0.1;
const SPEED_HOLD_S = 0.25;

export interface Pointer {
  id: number;
  x: number;
  y: number;
  /** Smoothed speed, px/s. */
  speed: number;
  /** 0…1: how much of its lens is there. */
  weight: number;
  /** Still over the sheet (false: released, fading). */
  here: boolean;
  /** Pressed travel since the last ripple it earned, px. */
  travel: number;
  /** Time of its last event, ms. */
  seen: number;
}

export class Pointers {
  list: Pointer[] = [];

  /** A pointer appeared or moved; `pressed`: a finger, or a mouse button held. Returns the ripples it earned. */
  move(id: number, x: number, y: number, timeMs: number, pressed: boolean): number {
    let p = this.list.find((q) => q.id === id);
    if (!p) {
      if (this.list.length >= MAX_POINTERS) {
        const gone = this.list.findIndex((q) => !q.here);
        if (gone < 0) return 0; // a fourth pointer is ignored
        this.list.splice(gone, 1);
      }
      p = { id, x, y, speed: 0, weight: 0, here: true, travel: 0, seen: timeMs };
      this.list.push(p);
      return 0;
    }
    const dist = Math.hypot(x - p.x, y - p.y);
    const dt = Math.max(4, timeMs - p.seen);
    if (p.here) p.speed += ((dist / dt) * 1000 - p.speed) * 0.35;
    else p.speed = 0; // back after a release: no jump from where it left
    p.x = x;
    p.y = y;
    p.seen = timeMs;
    p.here = true;
    if (!pressed) {
      p.travel = 0;
      return 0;
    }
    p.travel += dist;
    const earned = Math.floor(p.travel / DRAG_RIPPLE_PX);
    p.travel -= earned * DRAG_RIPPLE_PX;
    return Math.min(earned, 3);
  }

  release(id: number): void {
    const p = this.list.find((q) => q.id === id);
    if (p) {
      p.here = false;
      p.travel = 0;
    }
  }

  releaseAll(): void {
    for (const p of this.list) {
      p.here = false;
      p.travel = 0;
    }
  }

  /** Advances the weights and speeds by `dt` seconds and forgets pointers that have faded out. */
  step(dt: number): void {
    for (const p of this.list) {
      p.speed *= Math.exp(-dt / SPEED_HOLD_S);
      if (p.here) p.weight += (1 - p.weight) * (1 - Math.exp(-dt / ARRIVE_S));
      else p.weight *= Math.exp(-dt / RELEASE_S);
    }
    this.list = this.list.filter((p) => p.here || p.weight > 0.01);
  }

  clear(): void {
    this.list = [];
  }
}
