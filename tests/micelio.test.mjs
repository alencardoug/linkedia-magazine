// Pure parts of the "Micélio" cover (src/covers/micelio/motion.ts): the edition seed, the trail size and agent cap,
// the headline discs and the 3 s entry. The organism itself is accepted on a real GPU (docs/COVERS.md).
import { describe, expect, it } from 'vitest';
import {
  agentCap,
  discRadius,
  editionSeed,
  EXIT_MS,
  exitState,
  maxAgents,
  mulberry32,
  START_AGENTS,
  trailSize,
} from '../src/covers/micelio/motion';

describe('Micélio seed', () => {
  it('is the same for the same edition and differs for another one', () => {
    const titles = ['Um', 'Dois', 'Três'];
    expect(editionSeed('2026-11-09', titles)).toBe(editionSeed('2026-11-09', [...titles]));
    expect(editionSeed('2026-11-09', titles)).not.toBe(editionSeed('2026-11-10', titles));
    expect(editionSeed('2026-11-09', titles)).not.toBe(editionSeed('2026-11-09', ['Um', 'Dois']));
    const seed = editionSeed('', []);
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
  });

  it('drives a deterministic generator in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('Micélio sizes', () => {
  it('keeps the trail near 0.6 megatexel with the viewport shape, within the limits', () => {
    for (const [w, h] of [[1920, 1080], [1366, 593], [390, 844], [320, 568], [844, 390]]) {
      const [tw, th] = trailSize(w, h);
      expect(tw).toBeLessThanOrEqual(1024);
      expect(tw * th).toBeGreaterThan(3e5);
      expect(tw * th).toBeLessThan(7e5);
      expect(Math.abs(tw / th - w / h)).toBeLessThan(0.02 * (w / h) + 0.01);
    }
    expect(trailSize(1, 1).every((n) => n >= 2)).toBe(true);
  });

  it('caps the agents by area and by the allocation', () => {
    expect(agentCap(100, 100, maxAgents(false))).toBe(2200);
    expect(agentCap(1024, 576, maxAgents(false))).toBe(maxAgents(false));
    expect(maxAgents(true)).toBeLessThan(maxAgents(false));
    expect(START_AGENTS).toBeLessThanOrEqual(maxAgents(true));
  });

  it('clamps the headline discs, with a default for a missing reading time', () => {
    expect(discRadius(0)).toBe(18);
    expect(discRadius(6)).toBe(26);
    expect(discRadius(60)).toBe(30);
    expect(discRadius(Number.NaN)).toBe(24);
  });
});

describe('Micélio entry', () => {
  it('fades the food, then wipes to white, and is done at 3 s', () => {
    expect(EXIT_MS).toBe(3000);
    expect(exitState(-10)).toEqual({ food: 1, wipe: 0, done: false });
    let prev = exitState(0);
    for (let ms = 50; ms <= EXIT_MS; ms += 50) {
      const s = exitState(ms);
      expect(s.food).toBeLessThanOrEqual(prev.food);
      expect(s.wipe).toBeGreaterThanOrEqual(prev.wipe);
      prev = s;
    }
    expect(exitState(1500).food).toBe(0);
    expect(exitState(1500).wipe).toBe(0);
    expect(exitState(EXIT_MS - 1).done).toBe(false);
    expect(exitState(EXIT_MS)).toEqual({ food: 0, wipe: 1, done: true });
  });
});
