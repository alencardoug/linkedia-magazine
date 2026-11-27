import { describe, expect, it } from 'vitest';
import { burstFrame, createBurst, EXIT_MS, FLASH_DELAY_MS } from '../src/covers/transe/burst';
import { ART_SCALE, CYCLE_SECONDS, TranceSimulation } from '../src/covers/transe/simulation.js';

function field(width, height) {
  const w = width / ART_SCALE;
  const h = height / ART_SCALE;
  const box = { x: 15, y: h - 110, w: w - 30, h: 90 };
  return new TranceSimulation(w, h, box, 4224866490, 1, { x: 0, y: 0, w, h });
}

describe('Transe', () => {
  it.each([
    [1440, 900, 'LinkedIA'],
    [390, 844, 'IA'],
  ])('settles the %s×%s cover on %s', (width, height, word) => {
    const sim = field(width, height);
    sim.settleAt(0.2);
    sim.pointers.move(1, sim.w / 2, sim.h / 2, 0);
    sim.step(1 / 30);

    sim.settleAt(6);
    expect(sim.word).toBe(word);
    expect(sim.homes.glyphs.map((glyph) => glyph.letter).join('')).toBe(word);
    expect(sim.phase.wordWeight).toBe(1);
    expect(sim.wordAlpha).toBe(1);
    expect(sim.vortexAmount).toBe(0);
    expect(sim.motionCap).toBe(210);
    for (let i = 0; i < sim.wordCount; i++) {
      expect(Math.hypot(sim.x[i] - sim.homes.x[i], sim.y[i] - sim.homes.y[i])).toBeLessThan(12);
    }
  });

  it('retains the autonomous schedule of group jumps and one blink every ten seconds', () => {
    const sim = field(390, 844);
    sim.settleAt(0);
    expect(CYCLE_SECONDS).toBe(10);
    let blink = false;
    let pulses = 0;
    for (let frame = 0; frame < 300; frame++) {
      sim.step(1 / 30);
      if (sim.wordAlpha < 0.3 && !blink) pulses++;
      blink = sim.wordAlpha < 0.3;
    }
    expect(pulses).toBe(1);
    expect(sim.teleportCount).toBe(29);
  });

  it('gathers a free field into the pointer vortex', () => {
    const sim = field(390, 844);
    sim.settleAt(0.2);
    sim.fixedScore = 0.2;
    sim.pointers.move(1, 3, 3, 0);
    for (let frame = 0; frame < 30; frame++) sim.step(1 / 60);
    expect(sim.vortexAmount).toBeGreaterThan(0.99);
    for (let i = 0; i < sim.n; i++) {
      expect(Math.hypot(sim.x[i] - 3, sim.y[i] - 3)).toBeLessThan(sim.vortex.radius * 1.12);
    }
  });

  it('starts the burst at the live positions and scatters in independent directions', () => {
    const sim = field(390, 844);
    sim.settleAt(4);
    const rolls = [0, 0.4, 0.25, 0.4, 0.5, 0.4, 0.75, 0.4];
    const shards = createBurst(sim, () => rolls.shift() ?? 0.5);
    expect(shards).toHaveLength(sim.n);
    expect(shards[0]).toMatchObject({ x: sim.x[0], y: sim.y[0] });
    expect(shards[0].dx).toBeGreaterThan(0);
    expect(shards[1].dy).toBeGreaterThan(0);
    expect(shards[2].dx).toBeLessThan(0);
    expect(shards[3].dy).toBeLessThan(0);
  });

  it('delays the single flash until after the particles start moving', () => {
    const width = 900;
    const height = 540;
    const early = burstFrame(FLASH_DELAY_MS, width, height);
    const middle = burstFrame(400, width, height);
    const last = burstFrame(EXIT_MS, width, height);
    expect(early.travel).toBeGreaterThan(0);
    expect(early.lightOpacity).toBe(0);
    expect(middle.lightOpacity).toBeGreaterThan(0);
    expect(middle.lightRadius).toBeGreaterThan(early.lightRadius);
    expect(last.lightRadius).toBeGreaterThan(Math.hypot(width / 2, height / 2));
    expect(last.progress).toBe(1);
  });
});
