// Pure parts of the "Micélio" cover (unit-tested in tests/micelio.test.mjs): the edition seed, the trail size and the
// agent cap, the headline discs, the frozen simulation constants and the 3 s entry (owner's exception to the ~1 s rule,
// docs/COVERS.md). Values were tuned by eye on the owner's Intel HD 620 in the prototype and are frozen here.

/** Frozen simulation constants (prototype `P`, 2026-11-11, plus the owner's "hungrier pointer" of the same day). */
export const SIM = {
  sensorOffset: 9, // texels ahead
  sensorAngle: 0.5, // rad
  turn: 0.45, // rad
  step: 1.2, // texels per step
  decay: 0.92,
  deposit: 0.04,
  food: 3,
  respawn: 0.008,
  jitter: 0.12,
  exposure: 2.5,
  ghost: 0.995, // decay of the slow, wide memory (halo and afterimage)
  cap: 0.5, // sensed-trail cap
  gamma: 0.8,
  leave: 0.0008, // chance per step that a hungry agent on food starts a meal
  fed: 240, // steps of a meal
  // The pointer while someone steers it (idle: weight 2, far field 0.3, no pull): heavier, with a wider far field and
  // a pull every agent feels, fed or on the letters, so the veins rush to it and tear the name apart near it.
  pointerWeight: 4,
  far: 0.8,
  hunger: 0.5,
  hungerReach: 4, // pointer radii
} as const;

/** Agents allocated (and the most drawn): fewer on a coarse pointer (phones, tablets). */
export const maxAgents = (coarse: boolean): number => (coarse ? 64_000 : 128_000);
/** Agents drawn at start; the count doubles while frames stay fast (main.ts). */
export const START_AGENTS = 32_000;

/** Trail size for a CSS viewport: about 0.6 megatexel whatever its shape (letter strokes stay ~25 texels wide). */
export function trailSize(w: number, h: number): [number, number] {
  const tw = Math.max(2, Math.min(1024, Math.round(Math.sqrt((6e5 * w) / h)), Math.round(2 * w)));
  return [tw, Math.max(2, Math.round((tw * h) / w))];
}

/** The agent count follows the area: at most 22% of the trail texels, never above the allocation. */
export const agentCap = (tw: number, th: number, max: number): number => Math.min(max, Math.round(0.22 * tw * th));

/** Radius in trail texels of the food disc under a headline's node, from its reading time. */
export const discRadius = (minutes: number): number =>
  Math.max(18, Math.min(30, 14 + 2 * (Number.isFinite(minutes) ? minutes : 5)));

/** FNV-1a, 32 bits. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same edition, same dust: the seed of the agents' first positions and headings. */
export const editionSeed = (date: string, titles: readonly string[]): number => fnv1a(date + titles.join('|'));

/** Entry after a click (owner, 2026-11-11: 3 s instead of 0.7 s). */
export const EXIT_MS = 3000;

export interface ExitState {
  /** Food and the masthead mask, 1 → 0 over the first 36%. */
  food: number;
  /** White wipe from the tap over the last 36%. */
  wipe: number;
  done: boolean;
}

export function exitState(ms: number): ExitState {
  const e = Math.max(0, ms) / 1000;
  const d = EXIT_MS / 1000;
  return {
    food: Math.max(0, 1 - e / (0.36 * d)),
    wipe: Math.min(1, Math.max(0, (e - 0.64 * d) / (0.36 * d))),
    done: ms >= EXIT_MS,
  };
}
