// pt-BR labels and formatting shared by pages (public UI is pt-BR).
import type { Edition, Editoria } from './content';

// Editorias (D-079; labels of the merged section and of latest_news by the owner, D-084). A slug is a permalink:
// renaming one needs a 301 in firebase.json, like the two v1 slugs below.
export const EDITORIA_LABELS: Record<Editoria, string> = {
  ai_engineering_knowledge: 'IA na prática',
  ai_leadership: 'Liderança de IA',
  marketing: 'Marketing',
  health: 'Saúde',
  china: 'China',
  latest_news: 'Novidades de IA',
};

export const EDITORIA_SLUGS: Record<Editoria, string> = {
  ai_engineering_knowledge: 'ia-na-pratica',
  ai_leadership: 'lideranca-de-ia',
  marketing: 'marketing',
  health: 'saude',
  china: 'china',
  latest_news: 'novidades-de-ia',
};

/** v1 category slugs merged into `ia-na-pratica`; firebase.json redirects them with a 301. */
export const RETIRED_CATEGORY_SLUGS: readonly string[] = ['engenharia-de-ia', 'conhecimento-de-ia'];

export const editoriaHref = (editoria: Editoria): string => `/categorias/${EDITORIA_SLUGS[editoria]}`;

export const CALLOUT_LABELS: Record<string, string> = {
  note: 'Nota',
  takeaway: 'Para levar',
  warning: 'Atenção',
  uncertainty: 'Incerteza',
};

export const PROMPT_KIND_LABELS: Record<string, string> = {
  read_more: 'Saber mais',
  lab: 'Laboratório',
  architecture: 'Arquitetura',
  critic: 'Olhar crítico',
  leadership: 'Liderança',
  other: 'Prompt',
};

/**
 * A label for a free id (v2 callout variants and prompt kinds are open): only the map's own keys count, so an id
 * such as `constructor` falls back instead of reaching Object.prototype.
 */
export function knownLabel(labels: Record<string, string>, id: string | undefined, fallback: string): string {
  return id !== undefined && Object.hasOwn(labels, id) ? (labels[id] as string) : fallback;
}

/** "14 de outubro de 2026" for an ISO date (calendar date, no time zone shift). */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)),
  );
}

/** An instant's calendar date (`YYYY-MM-DD`) and clock time (`hh:mm`) in a time zone. */
export function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "Publicada em 21 de outubro de 2026, às 18:08": an edition's `published_at` in its time zone. */
export function publishedLabel(edition: Pick<Edition, 'published_at' | 'timezone'>): string {
  const { date, time } = localParts(edition.published_at, edition.timezone);
  return `Publicada em ${longDate(date)}, às ${time}`;
}

/**
 * "atualizada às 21:40" (or "atualizada em <data>, às hh:mm" on another day) when a later batch added stories to a
 * v2 edition; empty for one batch or a v1 edition.
 */
export function updatedLabel(edition: Pick<Edition, 'published_at' | 'updated_at' | 'timezone'>): string {
  if (!edition.updated_at || Date.parse(edition.updated_at) <= Date.parse(edition.published_at)) return '';
  const first = localParts(edition.published_at, edition.timezone);
  const last = localParts(edition.updated_at, edition.timezone);
  return last.date === first.date ? `atualizada às ${last.time}` : `atualizada em ${longDate(last.date)}, às ${last.time}`;
}

// Number shown for a source (`s7` → `7`), in citations and in the source list alike.
export function sourceNumber(id: string): string {
  return String(Number(id.slice(1)));
}

// Image hosts allowed to load (D-026: none in the MVP). Others render their text fallback.
export const IMAGE_HOSTS: readonly string[] = [];

export function imageAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return new URL(url).protocol === 'https:' && IMAGE_HOSTS.includes(host);
  } catch {
    return false;
  }
}
