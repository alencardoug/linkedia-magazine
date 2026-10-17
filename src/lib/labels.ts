// pt-BR labels and formatting shared by pages (public UI is pt-BR).
import type { Channel } from '../types/contracts';

export const CHANNEL_LABELS: Record<Channel, string> = {
  ai_engineering: 'Engenharia de IA',
  ai_leadership: 'Liderança de IA',
  ai_knowledge: 'Conhecimento de IA',
};

export const CHANNEL_SLUGS: Record<Channel, string> = {
  ai_engineering: 'engenharia-de-ia',
  ai_leadership: 'lideranca-de-ia',
  ai_knowledge: 'conhecimento-de-ia',
};

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

/** "14 de outubro de 2026" for an ISO date (calendar date, no time zone shift). */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)),
  );
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
