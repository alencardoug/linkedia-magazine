// Weekly covers (docs/COVERS.md, D-067): every cover ever published, newest first. `/` renders the current one,
// `/capas` lists them all and `/capas/<slug>` keeps each one reachable for good. Pure data, so the tests can check
// it; the pages import each cover's component themselves (src/pages/index.astro, src/pages/capas/<slug>.astro).

export interface CoverMeta {
  /** URL segment under /capas: lowercase ASCII letters, digits and hyphens. */
  slug: string;
  /** pt-BR display name. */
  title: string;
  /** ISO week in which it became the cover, e.g. `2026-W42`. */
  weekId: string;
  /** One or two pt-BR sentences for `/capas`. */
  summary: string;
  /** Short pt-BR phrase (no final period) for the cover's own fine print: what the art is and how it is made. */
  credit: string;
  /**
   * Edition (YYYY-MM-DD) whose text an archived cover keeps showing; set when the cover leaves `/`. Without it the
   * cover shows the latest edition.
   */
  edition?: string;
}

export const COVERS: readonly CoverMeta[] = [
  {
    slug: 'singularidade',
    title: 'Singularidade',
    weekId: '2026-W42',
    summary:
      'Um buraco negro simulado em tempo real curva a luz da capa: segue o cursor ou o dedo, distorce o que passa ' +
      'por baixo e, no clique, cresce até engolir a tela.',
    credit:
      'luz curvada por um buraco negro simulado em tempo real (relatividade geral) no seu aparelho, em código ' +
      'escrito por IA, sem imagens',
  },
];

/** The cover shown at `/`. */
export const CURRENT_COVER = 'singularidade';

export function coverBySlug(slug: string): CoverMeta {
  const cover = COVERS.find((c) => c.slug === slug);
  if (!cover) throw new Error(`Capa desconhecida: ${slug}`);
  return cover;
}

export const coverPath = (slug: string): string => `/capas/${slug}`;

/** The edition a cover shows: its frozen one once archived, else the newest (`editions` newest first). */
export function coverEdition<T extends { edition: { edition_date: string } }>(cover: CoverMeta, editions: T[]): T | undefined {
  return cover.edition ? editions.find((e) => e.edition.edition_date === cover.edition) : editions[0];
}

/** `2026-W42` → `semana 42 de 2026`. */
export function weekLabel(weekId: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) throw new Error(`Semana inválida: ${weekId}`);
  return `semana ${Number(match[2])} de ${match[1]}`;
}
