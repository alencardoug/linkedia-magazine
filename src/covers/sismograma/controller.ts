// Copied unchanged from the "Singularidade" cover (docs/COVERS.md: each cover keeps its own copy, so archived covers
// never change under a new one).
// Entry gestures of the cover (pure, unit-tested; Codex critique of the 3-01 plan). Given whether the art is live,
// it decides what a click, tap or key does. Navigation never depends on the renderer: without live art the link
// navigates natively; a live exit plays the ~0.9 s swallow under an independent deadline (main.ts), and a second
// activation enters at once. A drag, a long touch or a multi-touch steers the hole and never counts as a tap.
// Keys: Enter, Space and Escape from the page itself (no single-character shortcuts, WCAG 2.1.4); a focused control
// keeps its own behaviour.

/** Movement beyond this many CSS pixels between pointerdown and click makes it a drag, not a tap. */
export const TAP_SLOP_PX = 12;
/** A touch held longer than this is "holding the black hole", not a tap. */
export const LONG_PRESS_MS = 500;

export type Phase = 'html' | 'live' | 'leaving';

/** `native`: let the browser act (follow the link, open a tab…); `ignore`: swallow the event; `navigate`: go now;
 * `exit`: play the exit toward `at` (CSS px; null = where the hole is). */
export type Decision =
  | { kind: 'native' }
  | { kind: 'ignore' }
  | { kind: 'navigate' }
  | { kind: 'exit'; at: readonly [number, number] | null };

export interface PointerLike {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  timeStamp: number;
}

export interface EntryClick {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** 0 for a click synthesised from the keyboard or assistive technology. */
  detail: number;
  clientX: number;
  clientY: number;
}

export interface EntryKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
  /** Where focus is: the page itself, the cover's own link, or any other control (another link, the skip link…). */
  focus: 'page' | 'cover-link' | 'control';
}

interface Gesture {
  pointerId: number;
  touch: boolean;
  x0: number;
  y0: number;
  t0: number;
  tap: boolean;
}

export class EntryController {
  phase: Phase = 'html';
  private gesture: Gesture | null = null;
  private readonly down = new Set<number>();

  pointerDown(e: PointerLike): void {
    this.down.add(e.pointerId);
    if (e.isPrimary && this.down.size === 1) {
      this.gesture = { pointerId: e.pointerId, touch: e.pointerType === 'touch', x0: e.clientX, y0: e.clientY, t0: e.timeStamp, tap: true };
    } else if (this.gesture) {
      this.gesture.tap = false; // a second finger: a pinch or a two-finger gesture, never a tap
    }
  }

  pointerMove(e: PointerLike): void {
    const g = this.gesture;
    if (g && e.pointerId === g.pointerId && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TAP_SLOP_PX) g.tap = false;
  }

  pointerUp(e: PointerLike): void {
    this.down.delete(e.pointerId);
    const g = this.gesture;
    if (g && e.pointerId === g.pointerId && g.touch && e.timeStamp - g.t0 > LONG_PRESS_MS) g.tap = false;
  }

  pointerCancel(e: PointerLike): void {
    this.down.delete(e.pointerId);
    if (this.gesture && e.pointerId === this.gesture.pointerId) this.gesture.tap = false;
  }

  /** A click on the cover's viewport-wide link. */
  click(e: EntryClick): Decision {
    // A middle or modified click keeps the browser's behaviour (e.g. /revista in a new tab).
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return { kind: 'native' };
    const g = this.gesture;
    this.gesture = null;
    if (e.detail > 0 && g && !g.tap) return { kind: 'ignore' };
    if (this.phase === 'leaving') return { kind: 'navigate' };
    if (this.phase === 'live') return { kind: 'exit', at: e.detail > 0 ? [e.clientX, e.clientY] : null };
    return { kind: 'native' };
  }

  key(e: EntryKey): Decision {
    if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return { kind: 'native' };
    if (e.focus === 'control') return { kind: 'native' };
    if (e.key === 'Escape') return { kind: 'navigate' };
    // Enter on the focused link activates it natively (one click event), so it is not handled twice here.
    if (e.key === 'Enter' && e.focus === 'cover-link') return { kind: 'native' };
    if (e.key !== 'Enter' && e.key !== ' ') return { kind: 'native' };
    if (this.phase === 'live') return { kind: 'exit', at: null };
    return { kind: 'navigate' };
  }

  /** Back from the magazine (bfcache) or a fallback: forget any half-made gesture. */
  reset(phase: Phase): void {
    this.phase = phase;
    this.gesture = null;
    this.down.clear();
  }
}
