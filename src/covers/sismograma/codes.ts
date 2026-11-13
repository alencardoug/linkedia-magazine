// What the edition seed prints on the "Sismograma" sheet (pure, unit-tested in tests/sismograma.test.mjs): the
// monospaced code beside each line and the ink of each line.
import { fnv1a, mulberry32 } from './noise';

const hex = (value: number, digits: number): string => (value >>> 0).toString(16).toUpperCase().padStart(digits, '0').slice(-digits);

/** `2026-11-11` → `26315`: two digits of the year and the day of the year. Empty for a missing or broken date. */
export function ordinalDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
  if (!(day >= 1 && day <= 366)) return '';
  return `${String(y % 100).padStart(2, '0')}${String(day).padStart(3, '0')}`;
}

/** `LK0A-3FA2` (the line in hex and four digits hashed from the seed); every fifth line carries the sheet's date. */
export function lineCode(i: number, seed: number, ordinal: string): string {
  if (i % 5 === 4 && ordinal) return `D${ordinal}`;
  return `LK${hex(i, 2)}-${hex(fnv1a(`${seed >>> 0}:${i}`), 4)}`;
}

export const INKS: readonly string[] = ['#131016', '#2e1650', '#4a1f6b'];
export const INK_FIFTH = '#7a1763';
/** The stretches of a line inside the letters of the relief. */
export const INK_RELIEF = '#d01b8c';
export const INK_MARKER = '#19b8d6';

/** Ink of each line: a seeded run of black and two dark purples, and a magenta-brown on one line in five. */
export function lineInks(n: number, seed: number): string[] {
  const random = mulberry32(seed ^ 0x51ed270b);
  return Array.from({ length: n }, (_, i) => {
    const pick = INKS[Math.floor(random() * INKS.length)] ?? INKS[0]!;
    return i % 5 === 2 ? INK_FIFTH : pick;
  });
}
