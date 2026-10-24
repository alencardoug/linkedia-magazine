// "Duas sombras" (2026-W43, docs/COVERS.md): the pure parts — the sculpture whose two shadows are exactly the words,
// the parameters carved for each edition, the camera that frames them, and the motion. The WebGL path itself is
// checked on a real GPU (the owner's Chrome), since headless Chromium has none here.
import { describe, expect, it } from 'vitest';
import {
  bandsFor,
  bladeCount,
  coverageMargin,
  glslWord,
  MIN_MARGIN,
  paramsFor,
  rowIntervals,
  STROKE,
  uncoveredSamples,
  validParams,
  W_DIA,
  W_IA,
  wordDistance,
} from '../src/covers/duas-sombras/sculpture';
import { fitCamera, project } from '../src/covers/duas-sombras/stage';
import { BAKE_RANGE } from '../src/covers/duas-sombras/shaders';
import {
  EXIT_MS,
  exitState,
  MAX_SWELL,
  followStep,
  lamps,
  leanOf,
  pointerTarget,
  REACH,
  restBody,
  sweep,
  wander,
} from '../src/covers/duas-sombras/motion';

const DATES = ['2026-10-22', '2026-10-23', '2026-10-30', '2027-01-01', '2026-12-31', '', 'x'];

describe('the words', () => {
  it('draws D, I and A with ink and holes where a reader expects them', () => {
    expect(W_DIA).toBeCloseTo(2.36, 9);
    expect(W_IA).toBeCloseTo(1.38, 9);
    expect(wordDistance('DIA', 0.1, 0.5)).toBeLessThan(0); // D stem
    expect(wordDistance('DIA', 0.45, 0.5)).toBeGreaterThan(0); // D counter
    expect(wordDistance('DIA', 1.1, 0.5)).toBeLessThan(0); // I
    expect(wordDistance('DIA', 1.86, 0.5)).toBeGreaterThan(0); // A counter, above the crossbar
    expect(wordDistance('DIA', 1.86, 0.25)).toBeLessThan(0); // A crossbar
    expect(wordDistance('DIA', 1.86, 0.08)).toBeGreaterThan(0); // under the crossbar, between the legs
    expect(wordDistance('IA', 0.13, 0.99)).toBeLessThan(0);
    expect(wordDistance('IA', 0.32, 0.5)).toBeGreaterThan(0); // the gap between I and A
    expect(wordDistance('IA', 0.88, 1.01)).toBeGreaterThan(0); // nothing above the cap height
  });

  it('holds a full I stem on every row of both words (the witness of the coverage argument)', () => {
    for (let i = 0; i < 100; i++) {
      const v = (i + 0.5) / 100;
      for (const word of ['DIA', 'IA']) {
        expect(Math.max(...rowIntervals(word, v, 1 / 512).map(([a, b]) => b - a)), `${word} row ${v}`).toBeGreaterThanOrEqual(STROKE - 2 / 512);
      }
    }
  });

  it('feeds the shader from the same data', () => {
    const dia = glslWord('DIA');
    expect(dia).toMatch(/^float word_DIA\(vec2 p\) \{/);
    expect(dia.match(/box\(/g)).toHaveLength(5); // D stem + 2 bars, I, A crossbar
    expect(dia.match(/quad\(/g)).toHaveLength(2); // the A legs
    expect(dia.match(/bowl\(/g)).toHaveLength(1);
    expect(glslWord('IA')).not.toContain('bowl(');
  });
});

describe('the sculpture', () => {
  it('carves valid parameters for every edition, the same for the same date', () => {
    for (const d of DATES) {
      const p = paramsFor(d);
      expect(validParams(p), d).toBe(true);
      expect(coverageMargin(p), d).toBeGreaterThanOrEqual(MIN_MARGIN);
      expect(paramsFor(d)).toEqual(p);
    }
    expect(paramsFor('2026-10-22')).not.toEqual(paramsFor('2026-10-23'));
    // every day of two years: what the HTML carries is what the art accepts (rounding never breaks the margin)
    for (let day = 0; day < 731; day++) {
      const d = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const p = paramsFor(d);
      const fromHtml = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number(String(v))]));
      expect(validParams(fromHtml), d).toBe(true);
    }
  });

  it('casts exactly DIA along z and IA along x, with blades thinned for safety too', () => {
    for (const d of DATES.slice(0, 4)) {
      const p = paramsFor(d);
      expect(uncoveredSamples(p), d).toBe(0);
      expect(uncoveredSamples(p, 80, 1 / 192, 0.03), `${d} thinned`).toBe(0);
    }
  });

  it('notices blades too far apart (the check is not vacuous)', () => {
    const sparse = { theta: 45, spacing: 0.9, thickness: 0.03, phase: 0.2 };
    expect(validParams(sparse)).toBe(false);
    expect(uncoveredSamples(sparse, 80, 1 / 192)).toBeGreaterThan(0);
  });

  it('puts guard bands beyond both ends and counts the blades that hold ceramic', () => {
    const p = paramsFor('2026-10-23');
    const b = bandsFor(p);
    expect(b.count).toBeGreaterThan(10);
    expect(b.last - b.first).toBeCloseTo((b.count - 1) * p.spacing, 9);
    const n = bladeCount(p);
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThanOrEqual(b.count - 2);
  });

  it('refuses parameters outside the proven range', () => {
    const p = paramsFor('2026-10-23');
    expect(validParams({ ...p, phase: 0.999 })).toBe(true); // the largest phase paramsFor can produce
    for (const bad of [{ theta: 20 }, { theta: Number.NaN }, { spacing: 0.5 }, { thickness: 0 }, { thickness: p.spacing }, { phase: 1 }]) {
      expect(validParams({ ...p, ...bad }), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('the stage', () => {
  it('frames both shadows, at every reach of the sculpture, inside the art for any shape of screen', () => {
    for (const aspect of [0.45, 0.75, 1, 1.45, 1.78, 2.4]) {
      const cam = fitCamera(aspect);
      for (const [u, v] of [[-REACH[0], -REACH[1]], [REACH[0], REACH[1]], [0, 0]]) {
        const s = [u * Math.SQRT1_2, v, -u * Math.SQRT1_2];
        const points = [
          [0, 0.9 + s[1], 2.36 + s[2]],
          [0, 1.9 + s[1], 3.74 + s[2]],
          [1.38 + s[0], 0.9 + s[1], 0],
          [3.74 + s[0], 1.9 + s[1], 0],
        ];
        for (const pt of points) {
          const [x, y] = project(cam, pt, aspect);
          expect(Math.abs(x), `${aspect} ${pt}`).toBeLessThan(1);
          expect(Math.abs(y), `${aspect} ${pt}`).toBeLessThan(1);
        }
      }
    }
  });
});

describe('motion', () => {
  it('follows the pointer within its reach, and leans only a little', () => {
    let b = restBody();
    let maxLean = 0;
    for (let i = 0; i < 240; i++) {
      b = followStep(b, pointerTarget(1, -1), 1 / 60);
      const { yaw, pitch } = leanOf(b);
      maxLean = Math.max(maxLean, Math.abs(yaw), Math.abs(pitch));
    }
    expect(b.pos[0]).toBeCloseTo(REACH[0], 2);
    expect(b.pos[1]).toBeCloseTo(REACH[1], 2);
    expect(maxLean).toBeGreaterThan(0.005);
    expect(maxLean).toBeLessThanOrEqual(0.07); // beyond ~4 degrees the words smear into blocks
    expect(pointerTarget(9, -9)).toEqual(pointerTarget(1, -1)); // clamped
    const big = followStep(restBody(), [1, 1], 10); // a huge dt is capped
    expect(Math.abs(big.pos[0])).toBeLessThan(0.1);
  });

  it('wanders slowly near home when nobody steers', () => {
    expect(wander(0, 12).map(Math.abs)).toEqual([0, 0]);
    for (let s = 0; s < 200; s += 0.9) {
      const [u, v] = wander(s, s + 5);
      expect(Math.abs(u)).toBeLessThanOrEqual(REACH[0]);
      expect(Math.abs(v)).toBeLessThanOrEqual(REACH[1]);
    }
  });

  it('turns the left lamp on first, then the right one, and sweeps the glaze once', () => {
    expect(lamps(0)).toEqual([0, 0]);
    const [r1, l1] = lamps(500);
    expect(l1).toBeGreaterThan(r1);
    expect(lamps(2000)).toEqual([1, 1]);
    expect(sweep(0)).toBeLessThan(sweep(1800));
    expect(sweep(10_000)).toBe(sweep(20_000));
  });

  it('lets the shadows swallow the room and finishes on time', () => {
    expect(exitState(0)).toMatchObject({ swell: 0, fade: 1, done: false });
    let last = 0;
    for (let t = 0; t <= EXIT_MS; t += 25) {
      const s = exitState(t);
      expect(s.swell).toBeGreaterThanOrEqual(last);
      last = s.swell;
    }
    const end = exitState(EXIT_MS);
    expect(end.swell).toBe(MAX_SWELL);
    expect(MAX_SWELL).toBeLessThan(BAKE_RANGE); // the swollen shadows stay inside what the baked fields know
    expect(end.done).toBe(true);
    expect(end.fade).toBeCloseTo(0, 9);
    expect(end.approach).toBeCloseTo(1, 9);
  });
});
