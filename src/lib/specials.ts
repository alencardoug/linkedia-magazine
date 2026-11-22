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
  /**
   * The canonical URL of a guide that lives on its own site (V2-02b): `/edicoes` links there instead of
   * `/especiais/<slug>`, and the magazine serves no page for it (the old URLs redirect in `firebase.json`).
   */
  href?: string;
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
    // Interactive guide (owner, 2026-11-10: listed right below the AI guide), on its own site since V2-02b
    // (repo gproj). `/especiais/governanca-de-projetos*` redirects there; only the old `assets/<hash>/` stays here.
    slug: 'governanca-de-projetos',
    title: 'Guia Governança de Projetos: da intenção ao valor entregue',
    summary:
      'Guia interativo de governança de projetos com mapa de decisão e checklist de prontidão.',
    date: '2026-11-10',
    href: 'https://governaproj.web.app/',
  },
  {
    // NL→SQL comparison (owner, 2026-11-11: listed below the two guides), art-directed in S6 "Camadas de Vidro".
    slug: 'perguntar-ao-banco',
    title: 'Perguntamos ao banco em português e ele errou três em cada quatro vezes — os benchmarks já sabiam',
    summary:
      'Um teste de NL→SQL no Gemini do BigQuery acertou 5 de 20 perguntas. O que a pesquisa mostra e como a governança de dados ajuda cada plataforma a acertar mais.',
    date: '2026-11-11',
    readMinutes: 20,
    artDirected: true,
  },
  {
    slug: 'dez-layouts-governanca-de-ia',
    title: 'Dez layouts para as Guias da revista',
    summary:
      'As dez direções de arte desenhadas para a primeira tela do guia, cada uma no computador e no celular.',
    date: '2026-10-25',
  },
];

/** Where `/edicoes` links a special. */
export const specialHref = (s: Special): string => s.href ?? `/especiais/${s.slug}`;

export function special(slug: string): Special {
  const found = SPECIALS.find((s) => s.slug === slug);
  if (!found) throw new Error(`Conteúdo especial desconhecido: ${slug}`);
  return found;
}
