// Special content (D-075, owner 2026-10-23): reference guides written for the magazine outside the daily editions.
// Each one is a hand-written page at `/especiais/<slug>`, not an engine export, so it never touches `content/**` or
// the public contracts; `/edicoes` lists them under "Conteúdos especiais" in this array's order (a companion page
// follows the guide it belongs to: owner, 2026-10-25, D-077; the project guide sits right below the AI guide: owner,
// 2026-11-10).
export interface Special {
  slug: string;
  /** Link text on `/edicoes` and the page's <title>. */
  title: string;
  /** One line under the link and the page's meta description. */
  summary: string;
  /** Publication date (YYYY-MM-DD). */
  date: string;
  /** Reading time, for text pages only (a gallery has none). */
  readMinutes?: number;
  /** A self-contained page from `public/` with its own shell (no magazine header, theme or footer). */
  standalone?: boolean;
  /** An art-directed Astro page on `SpecialLayout.astro`: own fonts, palette and light/dark choice, no weekly theme. */
  artDirected?: boolean;
}

export const SPECIALS: readonly Special[] = [
  {
    slug: 'governanca-de-ia',
    title: 'Guia Governança de IA: como implementar em ambientes corporativos — da estratégia ao software de IA',
    summary:
      'Guia prático para ligar políticas, riscos e decisões da empresa aos controles, testes e evidências da engenharia.',
    date: '2026-10-23',
    readMinutes: 15,
    // 3-22 (D-076/D-077): re-staged in the S4 direction "Fio da Rastreabilidade", with a page-only dark mode.
    artDirected: true,
  },
  {
    // Standalone interactive guide (owner, 2026-11-10: listed right below the AI guide): its own shell and code,
    // a static snapshot in `public/especiais/` made by `scripts/snapshot-governanca-de-projetos.mjs`.
    slug: 'governanca-de-projetos',
    title: 'Guia Governança de Projetos: da intenção ao valor entregue',
    summary:
      'Guia interativo de governança de projetos com mapa de decisão e checklist de prontidão.',
    date: '2026-11-10',
    standalone: true,
  },
  {
    slug: 'dez-layouts-governanca-de-ia',
    title: 'Dez layouts para as Guias da revista',
    summary:
      'As dez direções de arte desenhadas para a primeira tela do guia, cada uma no computador e no celular.',
    date: '2026-10-25',
  },
];

export function special(slug: string): Special {
  const found = SPECIALS.find((s) => s.slug === slug);
  if (!found) throw new Error(`Conteúdo especial desconhecido: ${slug}`);
  return found;
}
