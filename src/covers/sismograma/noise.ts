// Seed and coherent noise of the "Sismograma" cover (pure, unit-tested in tests/sismograma.test.mjs). The same
// edition gives the same sheet: its date and lead headlines seed the noise permutation, the line colours and the codes.

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

export const editionSeed = (date: string, titles: readonly string[]): number => fnv1a(date + titles.join('|'));

export type Noise3 = (x: number, y: number, z: number) => number;

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t: number, a: number, b: number): number => a + t * (b - a);

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Ken Perlin's improved noise (2002) in 3D, its permutation shuffled by the seed. Values stay within −1…1. */
export function createNoise3(seed: number): Noise3 {
  const p = new Uint8Array(512);
  const order = Uint8Array.from({ length: 256 }, (_, i) => i);
  const random = mulberry32(seed);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }
  for (let i = 0; i < 512; i++) p[i] = order[i & 255]!;
  const at = (i: number): number => p[i]!;

  return (x, y, z) => {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const X = fx & 255;
    const Y = fy & 255;
    const Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = at(X) + Y;
    const AA = at(A) + Z;
    const AB = at(A + 1) + Z;
    const B = at(X + 1) + Y;
    const BA = at(B) + Z;
    const BB = at(B + 1) + Z;
    return lerp(
      w,
      lerp(v, lerp(u, grad(at(AA), x, y, z), grad(at(BA), x - 1, y, z)), lerp(u, grad(at(AB), x, y - 1, z), grad(at(BB), x - 1, y - 1, z))),
      lerp(
        v,
        lerp(u, grad(at(AA + 1), x, y, z - 1), grad(at(BA + 1), x - 1, y, z - 1)),
        lerp(u, grad(at(AB + 1), x, y - 1, z - 1), grad(at(BB + 1), x - 1, y - 1, z - 1)),
      ),
    );
  };
}
