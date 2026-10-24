// The sculpture of "Duas sombras" (pure, unit-tested in tests/duas-sombras.test.mjs). Two words drawn from simple
// shapes — "DIA" along x, "IA" along z, both one cap height tall — and a row of vertical blades. The blades are the
// volume V = DIA(x, y) ∧ IA(z, y) cut by periodic bands, so seen along z they cast exactly "DIA" and seen along x
// exactly "IA" (README.md, "The trick"). The same glyph data feeds the shader's bake pass (glslWord) and the tests.
// Units: cap heights (cap height 1, baseline 0).

/** Width of the I stems: every row of both words holds one, and the bands are spaced against it. */
export const STROKE = 0.26;
/** Smallest coverage margin allowed, in band units: room for texture and anti-aliasing error. */
export const MIN_MARGIN = 0.05;

type Box = readonly [number, number, number, number]; // x0, y0, x1, y1
type Quad = readonly [number, number, number, number, number, number, number, number]; // four corners, counter-clockwise
interface Bowl {
  cx: number;
  cy: number;
  inner: number;
  outer: number;
} // half annulus to the right of cx

interface Glyph {
  width: number;
  boxes: readonly Box[];
  quads: readonly Quad[];
  bowl?: Bowl;
}

const LEG: Quad = [0, 0, 0.27, 0, 0.62, 1, 0.35, 1];
const GLYPHS: Record<'D' | 'I' | 'A', Glyph> = {
  I: { width: STROKE, boxes: [[0, 0, STROKE, 1]], quads: [] },
  A: { width: 1, boxes: [[0.2, 0.17, 0.8, 0.33]], quads: [LEG, [0.73, 0, 1, 0, 0.65, 1, 0.38, 1]] },
  D: {
    width: 0.86,
    boxes: [
      [0, 0, STROKE, 1],
      [0, 0, 0.36, 0.25],
      [0, 0.75, 0.36, 1],
    ],
    quads: [],
    bowl: { cx: 0.36, cy: 0.5, inner: 0.25, outer: 0.5 },
  },
};

const GAP = 0.12;
function layout(letters: readonly ('D' | 'I' | 'A')[]): { glyph: Glyph; at: number }[] {
  let at = 0;
  return letters.map((letter) => {
    const glyph = GLYPHS[letter];
    const placed = { glyph, at };
    at += glyph.width + GAP;
    return placed;
  });
}
const WORDS = { DIA: layout(['D', 'I', 'A']), IA: layout(['I', 'A']) };
export type Word = keyof typeof WORDS;
const widthOf = (word: Word): number => {
  const last = WORDS[word].at(-1);
  return last ? last.at + last.glyph.width : 0;
};
export const W_DIA = widthOf('DIA');
export const W_IA = widthOf('IA');

function sdBox(x: number, y: number, [x0, y0, x1, y1]: Box): number {
  const dx = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2;
  const dy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function sdQuad(x: number, y: number, q: Quad): number {
  let d = -Infinity;
  for (let i = 0; i < 4; i++) {
    const ax = q[2 * i] ?? 0;
    const ay = q[2 * i + 1] ?? 0;
    const ex = (q[(2 * i + 2) % 8] ?? 0) - ax;
    const ey = (q[(2 * i + 3) % 8] ?? 0) - ay;
    d = Math.max(d, ((x - ax) * ey - (y - ay) * ex) / Math.hypot(ex, ey));
  }
  return d;
}

function sdBowl(x: number, y: number, b: Bowl): number {
  const r = Math.hypot(x - b.cx, y - b.cy);
  return Math.max(r - b.outer, b.inner - r, b.cx - x);
}

/** Signed distance (cap heights; negative inside) to `word` at (u along the word, v up from the baseline). */
export function wordDistance(word: Word, u: number, v: number): number {
  let d = Infinity;
  for (const { glyph, at } of WORDS[word]) {
    const x = u - at;
    for (const b of glyph.boxes) d = Math.min(d, sdBox(x, v, b));
    for (const q of glyph.quads) d = Math.min(d, sdQuad(x, v, q));
    if (glyph.bowl) d = Math.min(d, sdBowl(x, v, glyph.bowl));
  }
  return d;
}

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(5)));
/** GLSL `float word_<word>(vec2 p)` from the same data (needs `box`, `quad` and `bowl` helpers in the shader). */
export function glslWord(word: Word): string {
  const lines: string[] = [];
  for (const { glyph, at } of WORDS[word]) {
    for (const [x0, y0, x1, y1] of glyph.boxes) {
      lines.push(`d = min(d, box(p, vec2(${f(x0 + at)}, ${f(y0)}), vec2(${f(x1 + at)}, ${f(y1)})));`);
    }
    for (const q of glyph.quads) {
      const pts = [0, 1, 2, 3].map((i) => `vec2(${f((q[2 * i] ?? 0) + at)}, ${f(q[2 * i + 1] ?? 0)})`);
      lines.push(`d = min(d, quad(p, ${pts.join(', ')}));`);
    }
    const b = glyph.bowl;
    if (b) lines.push(`d = min(d, bowl(p, vec2(${f(b.cx + at)}, ${f(b.cy)}), ${f(b.inner)}, ${f(b.outer)}));`);
  }
  return `float word_${word}(vec2 p) {\n  float d = 1e9;\n  ${lines.join('\n  ')}\n  return d;\n}`;
}

// --- placement of the volume in the gallery (world units = cap heights; floor y = 0, left wall x = 0, right wall
// z = 0). "DIA" runs along x and casts on the right wall; "IA" runs along z, read from the far end toward the corner,
// and casts on the left wall. The offsets keep each shadow clear of the sculpture as seen from the corner's diagonal.
export const ORIGIN = { x: 1.38, y: 0.9, z: 2.36 } as const;
export const VOLUME = {
  lo: [ORIGIN.x, ORIGIN.y, ORIGIN.z],
  hi: [ORIGIN.x + W_DIA, ORIGIN.y + 1, ORIGIN.z + W_IA],
} as const;

/** World point → (u, v) on each word. */
export const onDIA = (x: number, y: number): [number, number] => [x - ORIGIN.x, y - ORIGIN.y];
export const onIA = (z: number, y: number): [number, number] => [ORIGIN.z + W_IA - z, y - ORIGIN.y];

export interface SculptureParams {
  /** Angle of the blades (degrees): their normal is (−cos θ, 0, sin θ). */
  theta: number;
  /** Distance between blade centres and blade thickness (cap heights). */
  spacing: number;
  thickness: number;
  /** Where the first band falls, as a fraction of the spacing. */
  phase: number;
}

/** Margin of the coverage argument: an I stem crossing the bands sweeps STROKE·min(sin θ, cos θ) of band
 * coordinate, which must exceed the gap between blades (spacing − thickness). */
export function coverageMargin(p: SculptureParams): number {
  const t = (p.theta * Math.PI) / 180;
  return STROKE * Math.min(Math.sin(t), Math.cos(t)) - (p.spacing - p.thickness);
}

/** FNV-1a over the string, then a small xorshift generator: the same date always carves the same sculpture. */
function random(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  let s = h || 1;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 8; i++) next(); // nearby dates hash to nearby states: stir before use
  return next;
}

/** The sculpture carved for an edition date (any string works; the empty string gives the default). */
export function paramsFor(seed: string): SculptureParams {
  const rand = random(seed || 'duas-sombras');
  const theta = 40 + 10 * rand();
  const spacing = 0.19 + 0.04 * rand();
  const t = (theta * Math.PI) / 180;
  // 0.002 above the minimum, so the rounding below (data attributes carry these numbers) never breaks the margin
  const gap = STROKE * Math.min(Math.sin(t), Math.cos(t)) - MIN_MARGIN - 0.002 - 0.015 * rand();
  const thickness = Math.min(0.13, Math.max(0.06, spacing - gap));
  return { theta: round(theta, 2), spacing: round(spacing, 4), thickness: round(thickness, 4), phase: Math.floor(rand() * 1000) / 1000 };
}
const round = (n: number, digits: number): number => +n.toFixed(digits);

/** True for numbers a sculpture may use (data attributes are re-checked at run time). */
export function validParams(p: SculptureParams): boolean {
  return (
    Number.isFinite(p.theta) &&
    p.theta >= 30 &&
    p.theta <= 60 &&
    p.spacing >= 0.12 &&
    p.spacing <= 0.3 &&
    p.thickness > 0 &&
    p.thickness < p.spacing &&
    p.phase >= 0 &&
    p.phase < 1 &&
    coverageMargin(p) >= MIN_MARGIN - 1e-9
  );
}

export interface Bands {
  /** Band normal in the xz plane. */
  normal: [number, number];
  /** Band coordinate of the first and last band centre, and how many there are. */
  first: number;
  last: number;
  count: number;
}

/** Bands covering the whole volume in band coordinate, with one guard band beyond each end. */
export function bandsFor(p: SculptureParams): Bands {
  const t = (p.theta * Math.PI) / 180;
  const normal: [number, number] = [-Math.cos(t), Math.sin(t)];
  const [x0, , z0] = VOLUME.lo;
  const [x1, , z1] = VOLUME.hi;
  const phis = [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ].map(([x = 0, z = 0]) => x * normal[0] + z * normal[1]);
  const min = Math.min(...phis);
  const max = Math.max(...phis);
  const first = min - p.spacing + p.phase * p.spacing;
  const count = Math.ceil((max + p.spacing - first) / p.spacing) + 1;
  return { normal, first, last: first + (count - 1) * p.spacing, count };
}

/** Intervals (in u) where a word has ink on row v, sampled every `step` (each interval shrunk to its samples). */
export function rowIntervals(word: Word, v: number, step: number): [number, number][] {
  const width = word === 'DIA' ? W_DIA : W_IA;
  const out: [number, number][] = [];
  let start: number | null = null;
  let last = 0;
  for (let u = 0; u <= width + 1e-9; u += step) {
    const inside = wordDistance(word, u, v) < 0;
    if (inside && start === null) start = u;
    if (!inside && start !== null) {
      out.push([start, last]);
      start = null;
    }
    if (inside) last = u;
  }
  if (start !== null) out.push([start, last]);
  return out;
}

/** Whether some band [c − t/2, c + t/2] meets the band-coordinate interval [lo, hi]. */
function meetsBand(lo: number, hi: number, b: Bands, thickness: number, spacing: number): boolean {
  const kLo = Math.ceil((lo - thickness / 2 - b.first) / spacing - 1e-12);
  const kHi = Math.floor((hi + thickness / 2 - b.first) / spacing + 1e-12);
  return Math.max(kLo, 0) <= Math.min(kHi, b.count - 1);
}

/**
 * Checks the ideal geometry on a grid: every sampled ink point of "DIA" (row v, position u) must be met by blades when
 * the light runs along z, and every ink point of "IA" when it runs along x (missing ink). Extra ink cannot occur:
 * the blades are max(volume, bands), so they never leave V, whose projections are the words. `shrink` thins the blades
 * first (a robustness margin). Returns the number of uncovered samples (0 = the ideal shadows are the words). The
 * rendered shadows (baked textures, shader) are checked on a real GPU, not here.
 */
export function uncoveredSamples(p: SculptureParams, rows = 160, step = 1 / 256, shrink = 0): number {
  const b = bandsFor(p);
  const thickness = p.thickness - shrink;
  const [nx, nz] = b.normal;
  let misses = 0;
  for (let i = 0; i < rows; i++) {
    const v = (i + 0.5) / rows;
    const dia = rowIntervals('DIA', v, step);
    const ia = rowIntervals('IA', v, step);
    // light along z: a DIA point at x is shadowed if, for some IA interval of z, the band coordinate meets a band
    for (const [a, c] of dia) {
      for (let u = a; u <= c + 1e-9; u += step) {
        const x = ORIGIN.x + u;
        const ok = ia.some(([s, e]) => {
          const zA = ORIGIN.z + W_IA - e;
          const zB = ORIGIN.z + W_IA - s;
          const p0 = x * nx + zA * nz;
          const p1 = x * nx + zB * nz;
          return meetsBand(Math.min(p0, p1), Math.max(p0, p1), b, thickness, p.spacing);
        });
        if (!ok) misses++;
      }
    }
    // light along x: an IA point at z is shadowed if, for some DIA interval of x, the band coordinate meets a band
    for (const [a, c] of ia) {
      for (let u = a; u <= c + 1e-9; u += step) {
        const z = ORIGIN.z + W_IA - u;
        const ok = dia.some(([s, e]) => {
          const p0 = (ORIGIN.x + s) * nx + z * nz;
          const p1 = (ORIGIN.x + e) * nx + z * nz;
          return meetsBand(Math.min(p0, p1), Math.max(p0, p1), b, thickness, p.spacing);
        });
        if (!ok) misses++;
      }
    }
  }
  return misses;
}

/** How many blades hold ceramic (bands that cross the volume somewhere), for the museum label. */
export function bladeCount(p: SculptureParams): number {
  const b = bandsFor(p);
  const [nx, nz] = b.normal;
  const tx = -nz;
  const tz = nx;
  let n = 0;
  for (let k = 0; k < b.count; k++) {
    const phi = b.first + k * p.spacing;
    let found = false;
    for (let i = 0; i < 24 && !found; i++) {
      const v = (i + 0.5) / 24;
      for (let s = -6; s <= 6 && !found; s += 0.01) {
        const x = nx * phi + tx * s;
        const z = nz * phi + tz * s;
        found = wordDistance('DIA', ...onDIA(x, ORIGIN.y + v)) < 0 && wordDistance('IA', ...onIA(z, ORIGIN.y + v)) < 0;
      }
    }
    if (found) n++;
  }
  return n;
}
