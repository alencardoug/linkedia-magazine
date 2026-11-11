// Stable codes of the guide (GOV-xx, TEC-xx): parsing the deliverable lines of §4.1 and the cross-references between
// the corporate deliverables and the technical artefacts they name (both sides come from the guide's own text).
import { FRONTS } from './data';

export interface Deliverable {
  code: string;
  name: string;
  /** The parenthesised correspondences, e.g. ["TEC-02", "TEC-03", "inventário de componentes"]. */
  pair: string[];
}

/** "GOV-04 Inventário corporativo de IA (TEC-02, TEC-03, inventário de componentes)" → parts. */
export function deliverable(item: string): Deliverable {
  const m = /^(\S+) (.*?)(?: \(([^)]+)\))?$/.exec(item);
  if (!m) throw new Error(`Entregável sem código: ${item}`);
  return { code: m[1], name: m[2], pair: m[3] ? m[3].split(', ') : [] };
}

export const tecId = (code: string) => code.toLowerCase();

/** GOV deliverables of §4.1 that name a technical artefact, e.g. TEC-03 → ["GOV-04", "GOV-08"]. */
export function govRefsOf(tec: string): string[] {
  return FRONTS.flatMap(([, , items]) => items.map(deliverable))
    .filter((d) => d.pair.includes(tec))
    .map((d) => d.code);
}
