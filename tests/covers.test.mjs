// Weekly covers (3-01, docs/COVERS.md): the registry, and the pure parts of the "Singularidade" cover — entry
// gestures, motion, adaptive quality and the bitmap budget. The WebGL path itself is checked on a real GPU (the
// owner's Chrome), since headless Chromium has none here.
import { describe, expect, it } from 'vitest';
import { COVERS, coverBySlug, coverEdition, coverPath, CURRENT_COVER, weekLabel } from '../src/covers/registry';
import { EntryController, LONG_PRESS_MS, TAP_SLOP_PX } from '../src/covers/singularidade/controller';
import {
  BIRTH_DELAY_MS,
  BIRTH_MS,
  birthScale,
  diskLevel,
  EXIT_MS,
  exitState,
  FOLLOW,
  ripple,
  springStep,
  vividness,
  wander,
} from '../src/covers/singularidade/motion';
import {
  calibratedScale,
  createQuality,
  initialScale,
  MAX_SCALE,
  MIN_SCALE,
  observeFrame,
  START_MAX_MS,
} from '../src/covers/singularidade/quality';
import { isSoftwareRenderer } from '../src/covers/singularidade/renderer';
import { bitmapScale } from '../src/covers/singularidade/snapshot';

describe('cover registry', () => {
  it('has unique, URL-safe slugs, ISO weeks and pt-BR texts, and a current cover', () => {
    const slugs = COVERS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COVERS) {
      expect(c.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(c.weekId).toMatch(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/);
      expect(c.title.trim()).not.toBe('');
      expect(c.summary.length).toBeGreaterThan(20);
      expect(c.credit.length).toBeGreaterThan(20);
      if (c.edition) expect(c.edition).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(slugs).toContain(CURRENT_COVER);
    expect(coverBySlug(CURRENT_COVER).edition).toBeUndefined(); // the current cover follows the newest edition
    // newest first: weeks never increase down the list
    const weeks = COVERS.map((c) => c.weekId);
    expect([...weeks].sort().reverse()).toEqual(weeks);
  });

  it('labels weeks, builds paths and refuses unknown covers', () => {
    expect(weekLabel('2026-W42')).toBe('semana 42 de 2026');
    expect(weekLabel('2027-W03')).toBe('semana 3 de 2027');
    expect(() => weekLabel('2026-42')).toThrow();
    expect(coverPath('singularidade')).toBe('/visual/singularidade');
    expect(() => coverBySlug('nao-existe')).toThrow(/Capa desconhecida/);
  });

  it('shows the newest edition, or the frozen one of an archived cover', () => {
    const editions = ['2026-10-16', '2026-10-15'].map((d) => ({ edition: { edition_date: d } }));
    const current = { ...COVERS[0] };
    expect(coverEdition(current, editions)?.edition.edition_date).toBe('2026-10-16');
    expect(coverEdition({ ...current, edition: '2026-10-15' }, editions)?.edition.edition_date).toBe('2026-10-15');
    expect(coverEdition(current, [])).toBeUndefined();
  });
});

const pointer = (over = {}) => ({ pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 100, clientY: 100, timeStamp: 0, ...over });
const click = (over = {}) => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, detail: 1, clientX: 100, clientY: 100, ...over });
const key = (k, over = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, focus: 'page', ...over });

describe('entry controller', () => {
  it('lets the link navigate natively without live art, and plays the exit with it', () => {
    const c = new EntryController();
    expect(c.click(click())).toEqual({ kind: 'native' });
    c.phase = 'live';
    expect(c.click(click({ clientX: 30, clientY: 40 }))).toEqual({ kind: 'exit', at: [30, 40] });
    c.phase = 'leaving';
    expect(c.click(click())).toEqual({ kind: 'navigate' }); // a second activation does not wait
  });

  it('keeps middle and modified clicks native, and aims a keyboard click at the hole', () => {
    const c = new EntryController();
    c.phase = 'live';
    for (const over of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
      expect(c.click(click(over))).toEqual({ kind: 'native' });
    }
    expect(c.click(click({ detail: 0 }))).toEqual({ kind: 'exit', at: null });
  });

  it('never treats a drag, a long touch, a second finger or a cancelled pointer as a tap', () => {
    const c = new EntryController();
    c.phase = 'live';
    const drag = (moves) => {
      c.pointerDown(pointer());
      for (const [x, y] of moves) c.pointerMove(pointer({ clientX: x, clientY: y }));
      c.pointerUp(pointer());
      return c.click(click());
    };
    expect(drag([[100 + TAP_SLOP_PX + 1, 100]])).toEqual({ kind: 'ignore' });
    expect(drag([[180, 100], [100, 100]])).toEqual({ kind: 'ignore' }); // away and back: the maximum counts
    expect(drag([[100 + TAP_SLOP_PX - 1, 100]]).kind).toBe('exit'); // a little jitter is still a tap

    c.pointerDown(pointer({ pointerType: 'touch', timeStamp: 0 }));
    c.pointerUp(pointer({ pointerType: 'touch', timeStamp: LONG_PRESS_MS + 1 }));
    expect(c.click(click())).toEqual({ kind: 'ignore' });

    c.pointerDown(pointer({ timeStamp: 0 }));
    c.pointerUp(pointer({ timeStamp: LONG_PRESS_MS + 1 })); // a slow mouse click is still a click
    expect(c.click(click()).kind).toBe('exit');

    c.pointerDown(pointer({ pointerType: 'touch' }));
    c.pointerDown(pointer({ pointerType: 'touch', pointerId: 2, isPrimary: false }));
    c.pointerUp(pointer({ pointerType: 'touch', pointerId: 2, isPrimary: false }));
    c.pointerUp(pointer({ pointerType: 'touch' }));
    expect(c.click(click())).toEqual({ kind: 'ignore' });

    c.pointerDown(pointer());
    c.pointerCancel(pointer());
    expect(c.click(click())).toEqual({ kind: 'ignore' });
    expect(c.click(click()).kind).toBe('exit'); // the gesture is spent: the next click is fresh
  });

  it('enters on Enter, Space and Escape from the page, and leaves other keys and controls alone', () => {
    const c = new EntryController();
    expect(c.key(key('Enter'))).toEqual({ kind: 'navigate' });
    expect(c.key(key(' '))).toEqual({ kind: 'navigate' });
    expect(c.key(key('Escape'))).toEqual({ kind: 'navigate' });
    c.phase = 'live';
    expect(c.key(key('Enter'))).toEqual({ kind: 'exit', at: null });
    expect(c.key(key(' '))).toEqual({ kind: 'exit', at: null });
    expect(c.key(key('Escape'))).toEqual({ kind: 'navigate' }); // Escape skips the animation
    for (const k of ['a', 'h', '1', 'Tab', 'ArrowDown', 'F5', 'Shift']) expect(c.key(key(k))).toEqual({ kind: 'native' });
    expect(c.key(key('Enter', { repeat: true }))).toEqual({ kind: 'native' });
    expect(c.key(key('Enter', { ctrlKey: true }))).toEqual({ kind: 'native' });
    expect(c.key(key('Enter', { isComposing: true }))).toEqual({ kind: 'native' });
    expect(c.key(key('Enter', { focus: 'control' }))).toEqual({ kind: 'native' }); // e.g. "Outras capas"
    expect(c.key(key('Escape', { focus: 'control' }))).toEqual({ kind: 'native' });
    // Enter on the focused cover link becomes its own click event: not handled twice
    expect(c.key(key('Enter', { focus: 'cover-link' }))).toEqual({ kind: 'native' });
    expect(c.key(key(' ', { focus: 'cover-link' }))).toEqual({ kind: 'exit', at: null });
    c.phase = 'leaving';
    expect(c.key(key('Enter'))).toEqual({ kind: 'navigate' });
  });

  it('forgets a half-made gesture on reset', () => {
    const c = new EntryController();
    c.phase = 'live';
    c.pointerDown(pointer());
    c.pointerMove(pointer({ clientX: 300 }));
    c.reset('live');
    expect(c.click(click()).kind).toBe('exit');
  });
});

describe('motion', () => {
  it('grows the hole from nothing during the birth and lights the disk after it', () => {
    expect(birthScale(0)).toBe(0);
    expect(birthScale(BIRTH_DELAY_MS)).toBe(0);
    expect(birthScale(BIRTH_DELAY_MS + BIRTH_MS)).toBe(1);
    expect(birthScale(BIRTH_DELAY_MS + BIRTH_MS / 2)).toBeGreaterThan(0.5); // ease-out
    expect(diskLevel(BIRTH_DELAY_MS + 400)).toBe(0);
    expect(diskLevel(BIRTH_DELAY_MS + 2000)).toBe(1);
    expect(vividness(0)).toBe(0);
    expect(vividness(10_000)).toBe(1);
  });

  it('swallows the screen and finishes on time', () => {
    expect(exitState(0)).toEqual({ rs: 1, fade: 1, done: false });
    let last = 0;
    for (let t = 0; t <= EXIT_MS; t += 50) {
      const s = exitState(t);
      expect(s.rs).toBeGreaterThanOrEqual(last);
      last = s.rs;
    }
    const end = exitState(EXIT_MS);
    expect(end.done).toBe(true);
    expect(end.fade).toBeCloseTo(0, 9);
    expect(end.rs).toBeGreaterThan(30); // the camera is inside the horizon
  });

  it('follows the target with a damped spring and wanders near home when idle', () => {
    let pos = [0, 0];
    let vel = [0, 0];
    for (let i = 0; i < 600; i++) [pos, vel] = springStep(pos, vel, [400, 300], FOLLOW, 1 / 60);
    expect(Math.hypot(pos[0] - 400, pos[1] - 300)).toBeLessThan(1);
    const [x, y] = springStep([0, 0], [0, 0], [100, 0], FOLLOW, 10)[0]; // a huge dt is capped
    expect(Math.abs(x)).toBeLessThan(100);
    expect(y).toBe(0);
    for (let s = 0; s < 120; s += 0.7) {
      const [wx, wy] = wander([500, 300], s, 600);
      expect(Math.abs(wx - 500)).toBeLessThanOrEqual(0.16 * 600 + 1e-9);
      expect(Math.abs(wy - 300)).toBeLessThanOrEqual(0.06 * 600 + 1e-9);
    }
    expect(wander([500, 300], 0, 600)).toEqual([500, 300]);
  });

  it('runs the ripple outward while it fades', () => {
    expect(ripple(-5, 10)).toEqual({ radius: 0, amplitude: 0 });
    const a = ripple(100, 10);
    const b = ripple(1000, 10);
    expect(b.radius).toBeGreaterThan(a.radius);
    expect(b.amplitude).toBeLessThan(a.amplitude);
  });
});

describe('adaptive quality', () => {
  it('starts from a pixel budget within the scale limits', () => {
    expect(initialScale(683, 593, 1)).toBe(MAX_SCALE);
    expect(initialScale(3840, 2160, 2)).toBe(MIN_SCALE);
    const s = initialScale(1366, 768, 1);
    expect(s).toBeGreaterThan(MIN_SCALE);
    expect(s).toBeLessThan(MAX_SCALE);
  });

  it('steps down when frames are slow and gives up animating at the floor', () => {
    let q = createQuality(1, 0);
    let t = 0;
    for (let i = 0; i < 40; i++) q = observeFrame(q, 40, (t += 40));
    expect(q.scale).toBeLessThan(1);
    for (let i = 0; i < 400; i++) q = observeFrame(q, 60, (t += 60));
    expect(q.scale).toBe(MIN_SCALE);
    expect(q.still).toBe(true);
    expect(observeFrame(q, 10, t + 10)).toBe(q); // a still frame stays still
  });

  it('steps up after sustained headroom', () => {
    let q = createQuality(0.5, 0);
    let t = 0;
    for (let i = 0; i < 400; i++) q = observeFrame(q, 16.7, (t += 16.7));
    expect(q.scale).toBeGreaterThan(0.5);
    expect(observeFrame(q, 0, t)).toBe(q);
  });

  it('forgives one stall but keeps a still frame after a second one within 3 s (software or overloaded GPU)', () => {
    let q = createQuality(0.8, 0);
    q = observeFrame(q, 2000, 2000);
    expect(q.still).toBe(false);
    q = observeFrame(q, 16.7, 2017);
    q = observeFrame(q, 900, 2917);
    expect(q.still).toBe(true);
    let spaced = createQuality(0.8, 0);
    spaced = observeFrame(spaced, 400, 400);
    spaced = observeFrame(spaced, 400, 5000); // 4.6 s apart: two hiccups, not a stalling device
    expect(spaced.still).toBe(false);
  });

  it('calibrates the starting scale from one frame at the minimum, or refuses a device too slow to animate', () => {
    expect(calibratedScale(START_MAX_MS + 1, 1)).toBeNull();
    expect(calibratedScale(Number.NaN, 1)).toBeNull();
    expect(calibratedScale(12, 1)).toBeCloseTo(MIN_SCALE); // already at the budget
    expect(calibratedScale(3, 1)).toBeCloseTo(MIN_SCALE * 2);
    expect(calibratedScale(0, 0.6)).toBe(0.6); // never above the pixel-budget limit
    expect(calibratedScale(60, 1)).toBe(MIN_SCALE);
  });

  it('recognises software rasterizers by name', () => {
    for (const name of [
      'Google SwiftShader',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
    ]) {
      expect(isSoftwareRenderer(name), name).toBe(true);
    }
    for (const name of ['ANGLE (Intel, Mesa Intel(R) HD Graphics 620 (KBL GT2), OpenGL 4.6)', 'Apple GPU', 'Adreno (TM) 650']) {
      expect(isSoftwareRenderer(name), name).toBe(false);
    }
  });
});

describe('cover bitmap budget', () => {
  it('keeps text sharp on ordinary screens and bounds the bitmap on big ones', () => {
    expect(bitmapScale(1366, 768, 1)).toBeCloseTo(1.25);
    const big = bitmapScale(2560, 1440, 2);
    expect(2560 * big * 1440 * big).toBeLessThanOrEqual(3_000_000 + 1);
    expect(Math.max(390, 844) * bitmapScale(390, 844, 3)).toBeLessThanOrEqual(4096);
  });
});
