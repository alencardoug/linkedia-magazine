// Text and data of the AI governance guide (D-075), verbatim; the page (3-22) only re-stages them.

export const TOC = [
  ['fundamentos', 'Fundamentos'],
  ['arquitetura', 'Arquitetura integrada'],
  ['diferencas', 'Corporativa × técnica'],
  ['corporativa', 'Parte I — Governança corporativa'],
  ['tecnica', 'Parte II — Governança técnica'],
  ['integracao', 'Camada de integração'],
  ['codigo', 'Governança como código'],
  ['gates', 'Ciclo de vida e gates'],
  ['exemplo', 'Exemplo aplicado'],
  ['responsabilidades', 'Responsabilidades'],
  ['roadmap', 'Roadmap de 90 dias'],
  ['indicadores', 'Indicadores e maturidade'],
  ['ferramentas', 'Ferramentas'],
  ['referencias', 'Referências'],
];

export const LIFECYCLE = ['Concepção', 'Aquisição ou desenvolvimento', 'Validação', 'Produção', 'Operação', 'Desativação'];

// The three layers carry the 14 reference pillars: corporate, the integration layer, technical.
export const LAYERS = [
  {
    side: 'corp',
    title: 'Governança corporativa',
    sub: 'AIMS · define o que é permitido, exigido e aceitável',
    pillars: ['Estratégia e políticas', 'Estrutura organizacional', 'Privacidade e conformidade', 'IA responsável', 'Terceiros e custos', 'Auditoria e melhoria contínua'],
  },
  {
    side: 'ponte',
    title: 'Camada de integração',
    sub: 'Catálogo corporativo · controles, evidências e decisões',
    pillars: ['Inventário de IA', 'Gestão de riscos'],
  },
  {
    side: 'tec',
    title: 'Governança técnica',
    sub: 'Plataforma técnica · implementa, testa e comprova',
    pillars: ['Dados', 'Modelos', 'Segurança de IA', 'Qualidade e avaliação', 'Operação e monitoramento', 'Agentes e autonomia'],
  },
];
export const FLOWS = [
  ['obrigações e apetite a risco', 'indicadores e propostas de decisão'],
  ['requisitos e controles aplicáveis', 'resultados e evidências'],
];

export const DIFFERENCES = [
  ['Pergunta-chave', 'O que pode ser feito e em que condições?', 'Como construir, validar e comprovar?'],
  ['Quem conduz', 'Liderança, negócio, jurídico, riscos, privacidade e comitê', 'Engenharia, arquitetura, segurança, qualidade e operações'],
  ['Como controla', 'Políticas, procedimentos, alçadas e decisões', 'Autorização, testes, avaliações, deploy, alertas e rollback'],
  ['Entregáveis', 'Políticas, inventário, registro de riscos, pareceres e atas', 'System Cards, testes, traces, pipelines e relatórios'],
  ['Aprovar significa', 'Autorizar o uso e aceitar o risco residual', 'Demonstrar adequação técnica e liberar a versão'],
  ['Ritmo', 'Periódico e diante de eventos relevantes', 'A cada mudança e deploy, e na operação contínua'],
];

export const FRONTS = [
  [
    'Estratégia e política',
    'Finalidade, escopo (sistemas próprios, APIs, IA de fornecedores e dos colaboradores) e usos permitidos, condicionados e proibidos; regras de supervisão humana, transparência, vieses, privacidade e segurança.',
    ['GOV-01 Política corporativa de IA (TEC-01)'],
  ],
  [
    'Estrutura decisória',
    'Patrocinador, comitê multidisciplinar, um owner de negócio e um responsável técnico por sistema; quem aprova, suspende e desativa.',
    ['GOV-02 Regimento do comitê', 'GOV-03 Matriz RACI'],
  ],
  ['Inventário', 'Cada uso de IA registrado com finalidade, dono, dados, terceiros, risco e estado.', ['GOV-04 Inventário corporativo de IA (TEC-02, TEC-03, inventário de componentes)']],
  [
    'Riscos e impactos',
    'Critérios (probabilidade, gravidade, escala, reversibilidade, dados sensíveis, autonomia) e controles exigidos por classe.',
    ['GOV-05 Metodologia de risco e impacto (avaliação de riscos, TEC-04)', 'GOV-06 Catálogo de controles (TEC-05)'],
  ],
  [
    'Homologação e terceiros',
    'Evidências por classe, quem aprova a produção, exceções; due diligence de fornecedores.',
    ['GOV-07 Procedimento de homologação (TEC-07, TEC-08)', 'GOV-08 Política de terceiros (TEC-03, SBOM e APIs)'],
  ],
  [
    'Supervisão e auditoria',
    'Indicadores, incidentes, auditorias proporcionais ao risco e revisão do programa.',
    ['GOV-09 Procedimento de incidentes (TEC-09, TEC-10)', 'GOV-10 Indicadores e auditoria (TEC-07, TEC-09, histórico de versões e decisões)'],
  ],
] as const;

export const RECORD = [
  ['Nome', 'Assistente de atendimento'],
  ['Finalidade', 'Responder dúvidas administrativas e fazer agendamentos permitidos'],
  ['Owner de negócio', 'Gerência de atendimento'],
  ['Responsável técnico', 'Engenharia de IA'],
  ['Arquitetura', 'LLM + RAG + agente'],
  ['Dados', 'Documentos institucionais e dados pessoais'],
  ['Terceiros', 'Provedor do LLM e serviços externos'],
  ['Classe de risco', 'Alto (hipótese a confirmar)'],
  ['Estado', 'Em produção, versão registrada'],
  ['Avaliações', 'Última (data, versão, relatório) e o gatilho da próxima'],
];

export const RISK_CLASSES = [
  ['Baixo', 'Apoio à redação de texto não sensível', 'Política de uso e cadastro simples'],
  ['Moderado', 'Consulta a documentos corporativos', 'Controle de acesso, validação e monitoramento'],
  ['Alto', 'Influência relevante em decisões operacionais', 'Avaliação formal, testes reforçados e aprovação'],
  ['Crítico', 'Possível impacto direto sobre saúde ou segurança', 'Especialistas, limites rígidos e supervisão humana adequada'],
];

export const DISCIPLINES = [
  ['Arquitetura e ciclo de vida', 'Arquitetura de referência, ambientes segregados, mudanças versionadas, critérios de deploy', ['TEC-01 System Card e arquitetura', 'TEC-08 Pipelines de validação e deploy']],
  ['Dados', 'Contratos, qualidade, linhagem, classificação, permissões e retenção', ['TEC-02 Inventário técnico de dados']],
  ['Modelos e LLMs', 'Versões, parâmetros, fornecedor, limitações e métricas', ['TEC-03 Registro de modelos (Model Card)']],
  ['Segurança', 'IAM, secrets, prompt injection e testes adversariais', ['TEC-04 Threat model']],
  ['RAG e agentes', 'Autorização na recuperação, contratos de ferramentas, limites de autonomia, confirmação', ['TEC-05 Controles de segurança e autonomia']],
  ['Qualidade e avaliação', 'Datasets, critérios de aceite, regressão e revisão humana', ['TEC-06 Datasets e plano de avaliação', 'TEC-07 Relatórios de avaliação']],
  ['Operação', 'Traces, logs protegidos, alertas, custos, rollback e desativação', ['TEC-09 Telemetria e indicadores', 'TEC-10 Runbooks operacionais']],
] as const;

export const TREE = `ai-project/
├── governance/          system-card.md, risk-assessment.md,
│                        control-mapping.yaml, approvals/
├── architecture/        architecture.md, adrs/
├── data/                data-contracts/, lineage.md
├── models/              model-registry.yaml
├── evaluations/         datasets/, metrics.yaml, reports/
├── tests/               security/, rag/, agents/
├── observability/       alert-rules.yaml
├── operations/          incident-runbook.md, rollback.md
└── .github/workflows/   ai-governance-gates.yml`;

export const CHAIN = [
  ['Política', 'POL-PRIV-01', 'Acesso a dados só por usuários autorizados'],
  ['Risco', 'RISK-023-01', 'Exposição cruzada de dados de pacientes'],
  ['Controle', 'CTRL-ACCESS-01', 'Autorização no backend e filtros na recuperação'],
  ['Implementação', null, 'IAM, verificação por recurso e consultas autorizadas'],
  ['Teste', 'TEST-ACCESS-01', 'Tentativas de acesso cruzado e casos negativos'],
  ['Evidência', 'EVID-2026-001', 'Resultado, commit, versão, ambiente e responsável'],
  ['Decisão', null, 'Aceitar o risco residual ou corrigir'],
];

export const YAML = `system_id: AI-023
system_name: assistente-atendimento
risk_level: alto
business_owner: gerencia-atendimento
technical_owner: engenharia-ia

controls:
  - id: CTRL-ACCESS-01
    source_policy: POL-PRIV-01
    risk_ids: [RISK-023-01]
    description: "Isolamento de dados por usuário"
    mandatory: true
    implementation:
      component: retrieval_api
      enforcement: backend_authorization
    validation:
      test: tests/security/test_data_isolation.py
      evidence: evaluations/reports/access-control.json
    review_trigger: "troca de modelo, mudança no RAG ou incidente"

  - id: CTRL-AGENT-02
    source_policy: POL-AUT-01
    risk_ids: [RISK-023-02]
    description: "Confirmação explícita para agendamentos"
    mandatory: true
    implementation:
      component: scheduling_service
      enforcement: explicit_user_confirmation
    validation:
      test: tests/agents/test_confirm_action.py
      evidence: evaluations/reports/agent-control.json
    review_trigger: "nova ferramenta ou permissão do agente"`;

export const AUTOMATE = [
  'Checar system_id, responsáveis e classe de risco.',
  'Conferir os controles obrigatórios para o tipo e a classe do sistema.',
  'Rodar testes de segurança, RAG, agente e regressão.',
  'Gerar relatório com commit, ambiente, data e versão do modelo.',
  'Bloquear o release em falha crítica e pedir aprovação humana nos gates previstos.',
  'Registrar os resultados no inventário e na aprovação.',
];

export const HUMAN = [
  'Aceitar formalmente risco residual significativo.',
  'Avaliar impactos sobre direitos e sobre a segurança de pessoas.',
  'Interpretar a lei e as obrigações regulatórias.',
  'Decidir suspensões, exceções e lançamentos de alto risco.',
  'Validar clínica ou setorialmente, quando exigido.',
];

export const GATES_BEFORE = [
  ['G0', 'Registro', 'Identificar a finalidade e o dono.', 'Formulário e inventário', 'Negócio + governança', 'Mapear'],
  ['G1', 'Avaliação', 'Classificar o risco e escolher os controles.', 'Avaliação de risco e plano de controles', 'Riscos, segurança, privacidade e negócio', 'Mapear'],
  ['G2', 'Validação', 'Implementar e testar os requisitos.', 'Relatórios e evidências técnicas', 'Engenharia + especialistas', 'Medir'],
];
export const GATES_AFTER = [
  ['G3', 'Produção', 'Avaliar o risco residual e autorizar a operação.', 'Aprovação formal vinculada à versão', 'Autoridade definida na política', 'Gerenciar'],
  ['G4', 'Operação', 'Monitorar, corrigir, revisar ou suspender.', 'Métricas, incidentes e reavaliações', 'Operações + negócio + governança', 'Gerenciar'],
];

export const ARCH_FLOW = [
  ['Usuário autenticado', null],
  ['API de atendimento', 'Identidade, sessão, limite de requisições e autorização'],
  ['Orquestração de IA', 'Prompt, modelo, políticas e roteamento'],
];
export const ARCH_BRANCHES = [
  ['RAG', 'Documentos aprovados, ACL, metadados e fontes', 'Repositório documental autorizado'],
  ['Agente', 'Ferramentas permitidas, limites e confirmação', 'Serviço de agendamento'],
];

export const CASE_DECISIONS = [
  'Aprovar a finalidade, os limites e os critérios mínimos para operar.',
  'Avaliar impactos assistenciais, de privacidade, de segurança e de operação.',
  'Definir quem aprova e atualiza os documentos usados como fonte.',
  'Fixar as bases legais e as condições para tratar dados pessoais.',
  'Definir quando o atendimento passa para uma pessoa e quando interromper, restringir ou reavaliar o sistema.',
];

export const CASE_CONTROLS = [
  [
    'RAG',
    [
      'Documentos com dono, classificação, versão, vigência e status de aprovação.',
      'Autorização checada antes de o conteúdo chegar ao LLM.',
      'Testes de recuperação e grounding; citação de fontes e abstenção sem base.',
      'Proteção contra instruções maliciosas nos documentos.',
    ],
  ],
  [
    'Agente de agendamento',
    [
      'Ferramentas permitidas por papel e contexto; leitura e escrita com permissões distintas.',
      'Identidade e permissões verificadas também no serviço de destino.',
      'Confirmação explícita antes de criar, alterar ou cancelar; limites de execução e sem duplicidade.',
      'Registro auditável de cada chamada de ferramenta.',
    ],
  ],
  [
    'Modelo e avaliações',
    [
      'Modelo, configuração e prompts versionados.',
      'Datasets com casos típicos, adversariais e críticos.',
      'Regressão a cada mudança; avaliação humana por amostragem e nos cenários críticos.',
    ],
  ],
  [
    'Operação',
    [
      'Traces de etapas, erros, latência, custo e qualidade.',
      'Alertas quando um controle essencial falha.',
      'Runbook para rollback, suspensão do agente ou modo somente leitura.',
    ],
  ],
] as const;

export const HOMOLOGATION = [
  ['Perguntas institucionais', 'Dataset validado e relatório', 'Ex.: ≥ 95% de acurácia factual no dataset definido'],
  ['Citação de fontes', 'Comparação entre resposta e documento', 'Fontes corretas nos casos elegíveis'],
  ['Acesso cruzado entre pacientes', 'Testes negativos de integração', 'Nenhuma exposição nos testes obrigatórios'],
  ['Pedidos clínicos fora do escopo', 'Avaliação por especialistas', 'Bloqueio ou encaminhamento nos casos críticos'],
  ['Agendamentos', 'Testes de ferramentas e de confirmação', 'Nenhuma escrita sem autorização e confirmação'],
  ['Prompt injection', 'Testes adversariais', 'Nenhuma violação crítica nos cenários testados'],
  ['Troca de modelo', 'Avaliação de regressão', 'Nenhuma regressão além dos limites aprovados'],
];

export const PILOT_EVIDENCE = [
  'AI-023 no inventário, com owner, responsável técnico e o mesmo ID em todos os registros.',
  'Avaliação de riscos e impactos aprovada.',
  'Controles obrigatórios com ID, ligados a políticas e riscos, cada um com seu teste.',
  'Dataset e critérios de aceite definidos; relatório de qualidade, segurança e regressão da versão avaliada.',
  'Traces e logs protegidos funcionando; responsáveis por incidentes e rollback definidos.',
  'Aprovação para produção e aceite de risco registrados e vinculados à versão.',
  'Gatilhos de revisão definidos: mudanças relevantes e incidentes.',
];

export const DECISIONS = [
  ['Adequação técnica', 'Arquitetura, engenharia, segurança e especialistas técnicos.'],
  ['Aceite do risco residual', 'O owner de negócio autorizado, conforme a metodologia de riscos.'],
  ['Autorização para produção', 'A autoridade formal definida na política de IA.'],
];

export const RACI = [
  ['Política corporativa', 'Governança de IA', 'Comitê e liderança'],
  ['Finalidade e resultados', 'Negócio', 'Governança'],
  ['Classificação de risco', 'Riscos e governança', 'Especialistas da área'],
  ['Arquitetura e implementação', 'Engenharia de IA', 'Arquitetura e segurança'],
  ['Privacidade', 'Jurídico e privacidade', 'Encarregado (DPO) e instâncias competentes'],
  ['Controles e testes', 'Engenharia e QA', 'Especialistas e revisores designados'],
  ['Incidentes e monitoramento', 'Operações e segurança', 'Governança, nos casos relevantes'],
  ['Auditoria independente', 'Auditoria interna', 'Instância de supervisão'],
];

export const ROADMAP = [
  ['Dias 1–15', 'Escopo, patrocinador, papéis e levantamento inicial', 'Mapeamento dos sistemas e da arquitetura existente', 'Inventário inicial com IDs únicos'],
  ['Dias 16–30', 'Política mínima, RACI e metodologia de riscos', 'Modelos de System Card e de documentação', 'Classificação de risco por aplicação'],
  ['Dias 31–45', 'Catálogo de controles e critérios de homologação', 'Controles e datasets do piloto', 'Mapa risco → controle → teste'],
  ['Dias 46–60', 'Fluxo de aprovações e exceções', 'CI/CD, testes, relatórios e evidências', 'Gates de homologação funcionando'],
  ['Dias 61–75', 'Indicadores, supervisão e processo de incidentes', 'Tracing, alertas, runbooks e rollback', 'Painel de indicadores de governança'],
  ['Dias 76–90', 'Revisão e primeiros achados de auditoria', 'Correção de lacunas e simulação de incidente', 'Primeira revisão integrada do programa'],
];

export const SUCCESS = [
  'Patrocínio e responsáveis formalizados.',
  'Política e metodologia de riscos mínimas aprovadas.',
  'Inventário corporativo inicial em uso.',
  'Catálogo de controles com IDs estáveis.',
  'Um piloto com as evidências mínimas da seção 9.6 e decisão formal de implantação.',
  'Monitoramento, procedimento de incidentes e backlog priorizado para expandir o programa.',
];

export const KPIS = [
  [
    'Cobertura',
    [
      ['% de sistemas inventariados', 'Conhecemos nosso universo de IA?'],
      ['% com responsável definido', 'Há prestação de contas?'],
      ['% com avaliação de risco', 'A gestão de riscos cobre o portfólio?'],
    ],
  ],
  [
    'Controle',
    [
      ['% com controles testados', 'Os controles são demonstráveis?'],
      ['% com validação documentada', 'Há evidência de qualidade?'],
      ['% de agentes com permissões revisadas', 'A autonomia está sob controle?'],
    ],
  ],
  [
    'Operação',
    [
      ['% com monitoramento ativo', 'Os sistemas seguem supervisionados?'],
      ['Incidentes por classe e severidade', 'Que riscos estão se materializando?'],
      ['Tempo médio de resposta e resolução', 'Com que rapidez reagimos?'],
      ['% de revisões no prazo', 'A governança se sustenta ao longo do tempo?'],
    ],
  ],
  ['Valor', [['Benefício realizado × custo', 'A IA gera valor para a empresa?']]],
] as const;

export const MATURITY = [
  ['Inicial', 'Sem política nem inventário confiáveis', 'Controles pontuais, sem padrão'],
  ['Básica', 'Responsáveis definidos e avaliação inicial de riscos', 'Documentação e testes mínimos'],
  ['Definida', 'Política, critérios e homologação padronizados', 'Controles e avaliações reproduzíveis'],
  ['Gerenciada', 'Indicadores, supervisão e auditoria periódica', 'Gates no CI/CD, traces, alertas e rollback'],
  ['Otimizada', 'Revisão contínua guiada por riscos e resultados', 'Controles amplamente automatizados e melhoria baseada em evidências'],
];

export const STACK = [
  ['Inventário e GRC', 'Jira, ServiceNow, plataforma de GRC ou sistema interno'],
  ['Código e CI/CD', 'GitHub, GitHub Actions ou Cloud Build'],
  ['Políticas declarativas', 'YAML com validadores próprios; OPA quando fizer sentido'],
  ['Testes e avaliação', 'pytest e avaliações específicas de LLM, RAG e agentes'],
  ['Tracing', 'LangSmith, Langfuse, OpenTelemetry'],
  ['Registro de modelos', 'MLflow, Vertex AI Model Registry ou equivalente'],
  ['Identidade e secrets', 'IAM corporativo ou Cloud IAM, Secret Manager'],
  ['Operação e painel', 'Cloud Logging e Cloud Monitoring; BigQuery com Looker ou Power BI'],
];

export const REFERENCES = [
  ['https://www.iso.org/standard/81230.html', 'ISO/IEC 42001:2023', 'sistema de gestão de IA (AIMS).'],
  ['https://www.nist.gov/itl/ai-risk-management-framework', 'NIST AI RMF 1.0', 'gestão de riscos em quatro funções: Governar, Mapear, Medir e Gerenciar.'],
  ['https://airc.nist.gov/airmf-resources/playbook/', 'NIST AI RMF Playbook', 'ações sugeridas para cada função.'],
  ['https://www.iso.org/standard/77304.html', 'ISO/IEC 23894:2023', 'gestão de riscos de IA integrada à da organização.'],
  ['https://www.iso.org/standard/42005', 'ISO/IEC 42005:2025', 'avaliação de impacto de sistemas de IA sobre pessoas, grupos e sociedade.'],
  ['https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence', 'NIST AI 600-1', 'perfil de riscos para IA generativa.'],
  ['https://genai.owasp.org/llm-top-10/', 'OWASP Top 10 para aplicações com LLM (2025)', 'riscos e controles técnicos de LLMs.'],
  ['https://genai.owasp.org/', 'OWASP GenAI Security Project', 'segurança de IA generativa e de agentes.'],
  ['https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd', 'ANPD — Relatório de Impacto à Proteção de Dados Pessoais (RIPD)', 'o relatório previsto na LGPD.'],
];

