// The seven links of the §6 traceability thread, with the family each one belongs to in the guide's own terms:
// policy and decision are corporate (§2 thesis: "A governança corporativa estabelece a obrigação", "A governança usa a
// evidência para decidir"); risk and control sit in the integration layer (§2: "Gestão de riscos"; §6: the control
// catalogue GOV-06 "é o elo"); implementation, test and evidence are technical ("A engenharia implementa o controle",
// "A avaliação produz a evidência").
import { CHAIN } from './data';
import type { Family } from './families';

export type Kind = 'politica' | 'risco' | 'controle' | 'implementacao' | 'teste' | 'evidencia' | 'decisao';

const KINDS: Record<string, [Kind, Family]> = {
  Política: ['politica', 'corp'],
  Risco: ['risco', 'ponte'],
  Controle: ['controle', 'ponte'],
  Implementação: ['implementacao', 'tec'],
  Teste: ['teste', 'tec'],
  Evidência: ['evidencia', 'tec'],
  Decisão: ['decisao', 'corp'],
};

export const LINKS = CHAIN.map((row) => {
  const [label, code, text] = row as [string, string | null, string];
  const [kind, family] = KINDS[label];
  return { label, code, text, kind, family };
});

export const KIND_LABEL: Record<Exclude<Kind, 'decisao'>, string> = {
  politica: 'Política',
  risco: 'Risco',
  controle: 'Controle',
  implementacao: 'Implementação',
  teste: 'Teste',
  evidencia: 'Evidência',
};

/** Which chain link a line of the §7.1 YAML declares (only relationships the file states; it has no decision). */
export function yamlKind(line: string): Exclude<Kind, 'decisao'> | null {
  const key = /^\s*(?:- )?([a-z_]+):/.exec(line)?.[1];
  switch (key) {
    case 'source_policy':
      return 'politica';
    case 'risk_ids':
      return 'risco';
    case 'id':
      return 'controle';
    case 'implementation':
    case 'component':
    case 'enforcement':
      return 'implementacao';
    case 'test':
      return 'teste';
    case 'evidence':
      return 'evidencia';
    default:
      return null;
  }
}
