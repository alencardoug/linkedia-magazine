// Pure parts of the "Sismograma" cover (src/covers/sismograma/): the seed and the noise, the line field (count, rows,
// breathing, relief, ripples, soft limit, lens, pen, entry), the springs, the markers, the codes and the pointers.
// The drawing itself runs in e2e/cover.spec.mjs (Canvas 2D works in headless Chromium) and is accepted by eye.
import { describe, expect, it } from 'vitest';
import { INK_FIFTH, INKS, lineCode, lineInks, ordinalDate } from '../src/covers/sismograma/codes';
import {
  addRipple,
  breathing,
  DRAG_C,
  EXIT_C,
  EXIT_MS,
  EXIT_SOFT,
  EXIT_SPEED,
  exitRadius,
  exitSpeed,
  lens,
  lensSigma,
  lensStrength,
  lineCount,
  penDone,
  penReach,
  pointStep,
  PRESS_C,
  reliefLift,
  RIPPLE_LIFE,
  RIPPLE_MAX,
  RIPPLE_SPEED,
  rippleAt,
  rippleWave,
  rows,
  smoothRows,
  softLimit,
  STILL_T,
} from '../src/covers/sismograma/field';
import { createMarkers, EXCURSION, MARKER_REST, readout, stepMarker } from '../src/covers/sismograma/markers';
import { createNoise3, editionSeed, mulberry32 } from '../src/covers/sismograma/noise';
import { grainShift } from '../src/covers/sismograma/paper';
import { DRAG_RIPPLE_PX, MAX_POINTERS, Pointers, RELEASE_S } from '../src/covers/sismograma/pointer';
import { energy, MAX_DT, resampleRows, stepSprings } from '../src/covers/sismograma/springs';

describe('Sismograma seed and noise', () => {
  it('is the same for the same edition and differs for another one', () => {
    const titles = ['Um', 'Dois', 'Três'];
    expect(editionSeed('2026-11-09', titles)).toBe(editionSeed('2026-11-09', [...titles]));
    expect(editionSeed('2026-11-09', titles)).not.toBe(editionSeed('2026-11-10', titles));
    const seed = editionSeed('', []);
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('gives coherent noise within −1…1, zero on the lattice, the same for a seed', () => {
    const noise = createNoise3(123);
    const again = createNoise3(123);
    const other = createNoise3(124);
    let differs = false;
    for (let i = 0; i < 400; i++) {
      const [x, y, z] = [i * 0.173 - 20, i * 0.071, i * 0.031 + 300];
      const v = noise(x, y, z);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(again(x, y, z)).toBe(v);
      if (other(x, y, z) !== v) differs = true;
      expect(Math.abs(noise(x + 0.001, y, z) - v)).toBeLessThan(0.01); // continuous
    }
    expect(differs).toBe(true);
    expect(noise(3, -7, 250)).toBeCloseTo(0, 12);
  });
});

describe('Sismograma field', () => {
  it('draws 15 lines plus one per article, at most 25', () => {
    expect(lineCount(0)).toBe(15);
    expect(lineCount(3)).toBe(18);
    expect(lineCount(10)).toBe(25);
    expect(lineCount(40)).toBe(25);
    expect(lineCount(-2)).toBe(15);
    expect(lineCount(Number.NaN)).toBe(15);
  });

  it('spaces the baselines evenly inside the plot and the points 8 to 16 px apart', () => {
    const { S, y } = rows(100, 640, 18);
    expect(y(0) - 100).toBeCloseTo(0.75 * S);
    expect(640 - y(17)).toBeCloseTo(0.75 * S);
    for (let i = 1; i < 18; i++) expect(y(i) - y(i - 1)).toBeCloseTo(S);
    expect(pointStep(1)).toBe(8);
    expect(pointStep(0.7)).toBeCloseTo(8 / 0.7);
    expect(pointStep(0.35)).toBe(16);
    expect(pointStep(0)).toBe(16);
  });

  it('breathes the same way for the same seed, under ⅔ of a spacing, differently on each line', () => {
    const noise = createNoise3(editionSeed('2026-11-09', ['a']));
    const again = createNoise3(editionSeed('2026-11-09', ['a']));
    for (let k = 0; k < 300; k++) {
      const [x, i, t] = [k * 13.7, k % 25, k * 0.37];
      const b = breathing(noise, x, i, t, 1366);
      expect(b).toBe(breathing(again, x, i, t, 1366));
      expect(Math.abs(b)).toBeLessThanOrEqual(0.655);
    }
    expect(breathing(noise, 400, 3, 2, 1366)).not.toBe(breathing(noise, 400, 4, 2, 1366));
    expect(breathing(noise, 400, 3, 2, 1366)).not.toBe(breathing(noise, 400, 3, 2.5, 1366));
  });

  it('lifts the relief upward between 0.35 and 0.6 of a spacing, highest in the still frame', () => {
    const S = 30;
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 36; t += 0.05) {
      const lift = -reliefLift(S, 1, t) / S;
      lo = Math.min(lo, lift);
      hi = Math.max(hi, lift);
    }
    expect(lo).toBeGreaterThan(0.34);
    expect(hi).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(-reliefLift(S, 1, STILL_T) / S).toBeCloseTo(0.6);
    expect(reliefLift(S, 0, 3) === 0).toBe(true);
    expect(reliefLift(S, 0.5, 3)).toBeCloseTo(reliefLift(S, 1, 3) / 2);
  });

  it('smooths the mask along each line only, keeping its mass away from the ends', () => {
    const [n, m] = [2, 40];
    const raw = new Float32Array(n * m);
    for (let k = 10; k < 30; k++) raw[k] = 1; // a letter 20 points wide on the first line only
    const smooth = smoothRows(raw, n, m, 3);
    const sum = (a, from, to) => a.slice(from, to).reduce((x, y) => x + y, 0);
    expect(sum(smooth, 0, m)).toBeCloseTo(20, 4);
    expect(sum(smooth, m, 2 * m)).toBe(0);
    expect(smooth[20]).toBeCloseTo(1, 5);
    expect(smooth[10]).toBeGreaterThan(0.4); // the edge of the letter: about half way up
    expect(smooth[10]).toBeLessThan(0.7);
    expect(smooth[3]).toBe(0); // the two passes reach 6 points
    expect(smooth[4]).toBeGreaterThan(0);
    for (let k = 3; k < 16; k++) expect(smooth[k + 1]).toBeGreaterThanOrEqual(smooth[k]);
  });

  it('runs a ripple outward at 420 px/s while it decays, and forgets it after 3 s', () => {
    const peak = (age) => {
      let best = [0, 0];
      for (let d = 0; d < 1500; d += 1) {
        const v = Math.abs(rippleAt(10, RIPPLE_SPEED, age, d));
        if (v > best[1]) best = [d, v];
      }
      return best;
    };
    const [d1, a1] = peak(0.5);
    const [d2, a2] = peak(1.5);
    expect(d1).toBeCloseTo(RIPPLE_SPEED * 0.5, -1);
    expect(d2).toBeCloseTo(RIPPLE_SPEED * 1.5, -1);
    expect((d2 - d1) / 1).toBeCloseTo(RIPPLE_SPEED, -1);
    expect(a1).toBeCloseTo(10 * Math.exp(-0.5 / 1.4), 1);
    expect(a2).toBeLessThan(a1);
    expect(rippleAt(10, RIPPLE_SPEED, 1, RIPPLE_SPEED + 600)).toBe(0); // far from the ring
    expect(rippleAt(10, RIPPLE_SPEED, -0.1, 0)).toBe(0);
    expect(rippleAt(10, RIPPLE_SPEED, RIPPLE_LIFE + 0.01, RIPPLE_SPEED * RIPPLE_LIFE)).toBe(0);
    expect(EXIT_C).toBeGreaterThan(PRESS_C);
    expect(PRESS_C).toBeGreaterThan(DRAG_C);
  });

  it('keeps neighbouring lines of a ripple less than a spacing apart', () => {
    // Two lines S apart see the same packet at most S / rippleWave radians out of phase.
    for (const S of [9, 20, 30, 45]) {
      const C = softLimit(EXIT_C * S, S);
      expect(2 * C * Math.sin(S / rippleWave(S) / 2)).toBeLessThan(S);
    }
    expect(rippleWave(10)).toBe(28);
  });

  it('keeps the newest ten living ripples', () => {
    let list = [];
    for (let i = 0; i < 14; i++) list = addRipple(list, { x: i, y: 0, t0: i * 0.1, C: 1, speed: RIPPLE_SPEED }, i * 0.1);
    expect(list).toHaveLength(RIPPLE_MAX);
    expect(list[0].x).toBe(4);
    list = addRipple(list, { x: 99, y: 0, t0: 10, C: 1, speed: RIPPLE_SPEED }, 10);
    expect(list.map((r) => r.x)).toEqual([99]); // the old ones died
  });

  it('never moves a line a whole spacing, whatever is asked', () => {
    const S = 24;
    for (const g of [-1e6, -200, -24, -3, 0, 3, 24, 200, 1e6]) {
      const u = softLimit(g, S);
      expect(Math.abs(u)).toBeLessThan(S);
      expect(Math.sign(u)).toBe(Math.sign(g));
    }
    expect(softLimit(1, S)).toBeCloseTo(1, 2); // small movements pass almost unchanged
    expect(softLimit(1e6, S)).toBeCloseTo(0.95 * S);
  });

  it('opens an eye under the pointer: nothing on its row, up above, down below, never crossing lines', () => {
    const sigma = lensSigma(1366);
    expect(sigma).toBe(110);
    expect(lensSigma(390)).toBe(90);
    const B = 40;
    expect(lens(B, sigma, 0, 0)).toBe(0);
    expect(lens(B, sigma, 35, 0)).toBe(0);
    expect(lens(B, sigma, 0, -50)).toBeLessThan(0); // a line above goes up
    expect(lens(B, sigma, 0, 50)).toBeGreaterThan(0);
    expect(lens(B, sigma, 12, -50)).toBeCloseTo(-lens(B, sigma, 12, 50));
    expect(lens(B, sigma, 0, 0.5 * sigma)).toBeGreaterThan(0.8 * B); // most of B within half a sigma
    let peak = 0;
    for (let dy = 0; dy < 500; dy++) peak = Math.max(peak, lens(B, sigma, 0, dy));
    expect(peak).toBeLessThanOrEqual(B);
    expect(peak).toBeGreaterThan(0.85 * B);
    expect(lens(B, sigma, 300, 30)).toBeLessThan(0.03 * B); // local
    expect(lens(B, sigma, 0, 5 * sigma)).toBe(0);
    // With the strongest lens the map y → y + lens(y) still increases: lines bunch around the eye, never cross.
    for (const s of [90, 110]) {
      const strongest = lensStrength(1000, 5000, s);
      expect(strongest).toBeCloseTo(1.2 * s);
      for (let dy = -600; dy < 600; dy += 0.5) {
        expect(dy + 0.5 + lens(strongest, s, 0, dy + 0.5)).toBeGreaterThan(dy + lens(strongest, s, 0, dy));
      }
    }
  });

  it('strengthens the lens with the speed of the pointer', () => {
    const sigma = 110;
    expect(lensStrength(30, 0, sigma)).toBeCloseTo(30);
    expect(lensStrength(30, 750, sigma)).toBeCloseTo(30 * 1.9);
    expect(lensStrength(30, 1500, sigma)).toBeCloseTo(30 * 2.8);
    expect(lensStrength(30, 9000, sigma)).toBeCloseTo(30 * 2.8);
    expect(lensStrength(8, 0, sigma)).toBeCloseTo(0.26 * sigma); // a tight sheet still opens
  });

  it('plots the lines one after the other and erases the sheet in 0.7 s on entry', () => {
    expect(penReach(0, 0)).toBe(0);
    expect(penReach(0.2, 0)).toBeGreaterThan(penReach(0.2, 5));
    expect(penReach(penDone(18), 17)).toBe(1);
    expect(penReach(Infinity, 24)).toBe(1);
    for (let i = 0; i < 18; i++) {
      let last = 0;
      for (let t = 0; t <= penDone(18); t += 0.05) {
        const r = penReach(t, i);
        expect(r).toBeGreaterThanOrEqual(last);
        last = r;
      }
    }
    expect(penDone(25)).toBeLessThan(2.1);
    expect(EXIT_MS).toBeLessThanOrEqual(1000); // docs/COVERS.md
    expect(exitRadius(0, 800)).toBe(0);
    expect(exitRadius(EXIT_MS, 800)).toBe(800 + EXIT_SOFT);
    expect(exitRadius(EXIT_MS * 3, 800)).toBe(800 + EXIT_SOFT);
    expect(exitSpeed(100)).toBe(EXIT_SPEED);
    // from a corner of a large screen the ripple still rides the rim of the erased disc
    expect((exitSpeed(2200) * EXIT_MS) / 1000).toBeCloseTo(2200 + EXIT_SOFT);
  });
});

describe('Sismograma springs', () => {
  const sheet = (n, m, seed) => {
    const random = mulberry32(seed);
    const u = Float32Array.from({ length: n * m }, () => 60 * (random() - 0.5));
    const v = Float32Array.from({ length: n * m }, () => 400 * (random() - 0.5));
    const goal = Float32Array.from({ length: n * m }, () => 20 * (random() - 0.5));
    return { u, v, goal };
  };

  it('never gains energy at the longest step and comes to rest on flat goals', () => {
    const [n, m] = [18, 60];
    for (const dt of [MAX_DT, 1 / 60, 1 / 120]) {
      const { u, v } = sheet(n, m, 42);
      const goal = new Float32Array(n * m).fill(5);
      const start = energy(u, v, goal, n, m);
      let before = start; // the energy a quarter of a second earlier
      for (let step = 1; step <= Math.round(4 / dt); step++) {
        stepSprings(u, v, goal, n, m, dt);
        const e = energy(u, v, goal, n, m);
        expect(e).toBeLessThanOrEqual(start);
        if (step % Math.round(0.25 / dt) === 0) {
          if (before > start * 1e-9) expect(e).toBeLessThan(before); // below that it is 32-bit rounding
          before = e;
        }
      }
      expect(before).toBeLessThan(start * 1e-6);
      for (const x of u) expect(x).toBeCloseTo(5, 1);
    }
  });

  it('settles between uneven goals without gaining energy', () => {
    // Each line is also tied to its neighbours, so it rests near its goal, not on it: the energy falls to a floor.
    const [n, m] = [18, 60];
    const { u, v, goal } = sheet(n, m, 42);
    let last = energy(u, v, goal, n, m);
    for (let step = 1; step <= 240; step++) {
      stepSprings(u, v, goal, n, m, MAX_DT);
      const e = energy(u, v, goal, n, m);
      expect(e).toBeLessThanOrEqual(last * (1 + 1e-9));
      last = e;
    }
    expect(Math.max(...v.map(Math.abs))).toBeLessThan(0.01);
  });

  it('clamps a huge step instead of blowing up, and ignores a negative one', () => {
    const [n, m] = [4, 10];
    const a = sheet(n, m, 7);
    const b = sheet(n, m, 7);
    stepSprings(a.u, a.v, a.goal, n, m, 5);
    stepSprings(b.u, b.v, b.goal, n, m, MAX_DT);
    expect([...a.u]).toEqual([...b.u]);
    const c = sheet(n, m, 7);
    const before = [...c.u];
    stepSprings(c.u, c.v, c.goal, n, m, -1);
    expect([...c.u]).toEqual(before);
  });

  it('pulls a line toward its neighbours', () => {
    // Three lines at rest on flat goals; the middle one is displaced: the outer ones follow it.
    const [n, m] = [3, 1];
    const u = Float32Array.from([0, 10, 0]);
    const v = new Float32Array(3);
    const goal = new Float32Array(3);
    stepSprings(u, v, goal, n, m, 1 / 60);
    expect(v[0]).toBeGreaterThan(0);
    expect(v[2]).toBeGreaterThan(0);
    expect(v[1]).toBeLessThan(0);
  });

  it('resamples the state when the point step changes', () => {
    const from = Float32Array.from([0, 10, 20, 30, 5, 5, 5, 5]); // two lines of four points
    const to = resampleRows(from, 2, 4, 7);
    expect([...to.slice(0, 7)]).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect([...to.slice(7)]).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect([...resampleRows(to, 2, 7, 4)]).toEqual([...from]);
  });
});

describe('Sismograma markers', () => {
  it('rest at their fractions of the width and read their position out', () => {
    const markers = createMarkers(1000);
    expect(markers.map((m) => m.x)).toEqual(MARKER_REST.map((f) => f * 1000));
    expect(readout('A', 240, 1000)).toBe('A 0.240');
    expect(readout('B', 763.4, 1000)).toBe('B 0.763');
  });

  it('are pushed away by a pointer, kicked by a ripple, never past the excursion, and come back', () => {
    const [m] = createMarkers(1000);
    for (let i = 0; i < 600; i++) stepMarker(m, [[m.rest - 5, 1]], 0, 1 / 60); // a pointer just left of it
    expect(m.x).toBeGreaterThan(m.rest + 20);
    expect(m.x).toBeLessThanOrEqual(m.rest + EXCURSION);
    for (let i = 0; i < 600; i++) stepMarker(m, [], 0, 1 / 60);
    expect(m.x).toBeCloseTo(m.rest, 1);
    for (let i = 0; i < 600; i++) stepMarker(m, [[m.rest + 5, 1]], 0, 1 / 60);
    expect(m.x).toBeLessThan(m.rest - 20);
    for (let i = 0; i < 600; i++) stepMarker(m, [[m.rest + 400, 1]], 0, 1 / 60); // out of reach
    expect(m.x).toBeCloseTo(m.rest, 1);
    for (let i = 0; i < 3000; i++) {
      stepMarker(m, [[m.x - 1, 1], [m.x - 2, 1], [m.x - 3, 1]], 500 * Math.sin(i / 7), 1 / 30);
      expect(Math.abs(m.x - m.rest)).toBeLessThanOrEqual(EXCURSION);
    }
    stepMarker(m, [], 40, 1 / 60);
    const kicked = m.v;
    stepMarker(m, [], -40, 1 / 60);
    expect(m.v).toBeLessThan(kicked);
  });
});

describe('Sismograma codes', () => {
  it('prints the ordinal date of the edition', () => {
    expect(ordinalDate('2026-11-11')).toBe('26315');
    expect(ordinalDate('2026-01-01')).toBe('26001');
    expect(ordinalDate('2028-12-31')).toBe('28366'); // a leap year
    expect(ordinalDate('2026-11-09T10:00:00Z')).toBe('26313');
    expect(ordinalDate('')).toBe('');
    expect(ordinalDate('ontem')).toBe('');
  });

  it('codes every line from the seed, with the date on every fifth', () => {
    expect(lineCode(0, 1, '26313')).toMatch(/^LK00-[0-9A-F]{4}$/);
    expect(lineCode(10, 1, '26313')).toMatch(/^LK0A-[0-9A-F]{4}$/);
    expect(lineCode(24, 1, '26313')).toBe('D26313');
    expect(lineCode(4, 1, '26313')).toBe('D26313');
    expect(lineCode(4, 1, '')).toMatch(/^LK04-[0-9A-F]{4}$/); // no date: a code like the others
    expect(lineCode(7, 1, '26313')).toBe(lineCode(7, 1, '26313'));
    const codes = (seed) => Array.from({ length: 25 }, (_, i) => lineCode(i, seed, '26313'));
    expect(codes(1)).not.toEqual(codes(2));
    expect(new Set(codes(1).filter((c) => c.startsWith('LK'))).size).toBe(20);
  });

  it('inks the lines from the seed, one in five in the magenta-brown', () => {
    const inks = lineInks(25, 99);
    expect(inks).toEqual(lineInks(25, 99));
    expect(inks).toHaveLength(25);
    inks.forEach((ink, i) => {
      if (i % 5 === 2) expect(ink).toBe(INK_FIFTH);
      else expect(INKS).toContain(ink);
    });
    expect(new Set(inks).size).toBeGreaterThan(2);
    expect(lineInks(25, 100)).not.toEqual(inks);
  });
});

describe('Sismograma pointers and paper', () => {
  it('tracks up to three pointers, their speed and the ripples a pressed drag earns', () => {
    const p = new Pointers();
    expect(p.move(1, 100, 100, 0, false)).toBe(0);
    expect(p.list).toHaveLength(1);
    // a hovering mouse: speed, no ripples
    let earned = 0;
    for (let i = 1; i <= 20; i++) earned += p.move(1, 100 + 16 * i, 100, 16 * i, false);
    expect(earned).toBe(0);
    expect(p.list[0].speed).toBeGreaterThan(700);
    expect(p.list[0].speed).toBeLessThan(1100); // 1000 px/s, smoothed
    // pressed: one ripple per DRAG_RIPPLE_PX of travel
    for (let i = 1; i <= 45; i++) earned += p.move(1, 420 + 10 * i, 100, 320 + 16 * i, true);
    expect(earned).toBe(Math.floor(450 / DRAG_RIPPLE_PX));
    // more pointers than the limit
    for (let id = 2; id <= 5; id++) p.move(id, 10, 10, 0, true);
    expect(p.list).toHaveLength(MAX_POINTERS);
    expect(p.move(5, 20, 20, 16, true)).toBe(0); // ignored
    p.release(2);
    p.move(6, 30, 30, 0, true); // takes the place of the released one
    expect(p.list.map((q) => q.id).sort()).toEqual([1, 3, 6]);
  });

  it('raises the weight of a pointer while it is there and fades it after release', () => {
    const p = new Pointers();
    p.move(1, 0, 0, 0, true);
    expect(p.list[0].weight).toBe(0);
    for (let i = 0; i < 30; i++) p.step(1 / 60);
    expect(p.list[0].weight).toBeGreaterThan(0.99);
    p.release(1);
    p.step(RELEASE_S);
    expect(p.list[0].weight).toBeCloseTo(Math.exp(-1), 1);
    for (let i = 0; i < 400; i++) p.step(1 / 60);
    expect(p.list).toHaveLength(0);
    // the speed dies down when the pointer stops
    p.move(2, 0, 0, 0, false);
    p.move(2, 50, 0, 16, false);
    const speed = p.list[0].speed;
    p.step(0.5);
    expect(p.list[0].speed).toBeLessThan(speed / 5);
    p.releaseAll();
    expect(p.list.every((q) => !q.here)).toBe(true);
    p.clear();
    expect(p.list).toHaveLength(0);
  });

  it('nudges the grain within two pixels, never twice to the same place', () => {
    let last = [9, 9];
    for (let k = 0; k < 40; k++) {
      const shift = grainShift(k);
      for (const d of shift) expect(Math.abs(d)).toBeLessThanOrEqual(2);
      expect(shift).not.toEqual(last);
      last = shift;
    }
  });
});
