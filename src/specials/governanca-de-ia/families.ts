// Colour families of the S4 direction: cool = corporate governance, warm = technical, ponte = the integration layer.
export type Family = 'corp' | 'tec' | 'ponte' | 'ink';

/** Family of a section by its number (1–14): Parte I is corporate, Parte II technical, §6 the integration layer. */
export function familyOf(n: number): Family {
  return n === 4 ? 'corp' : n === 5 ? 'tec' : n === 6 ? 'ponte' : 'ink';
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
