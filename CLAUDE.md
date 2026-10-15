@AGENTS.md

# Claude Code notes
- STATUS and the NEXT task live in `../linkedia-engine/docs/STATUS.md`; update it there when a magazine task is done.
- Prefer zero client JS; vanilla TypeScript for small interactions; React only inside a lab theme that needs it, lazy-loaded.
- Preserve the minimal dark baseline and every historical route; never couple a theme change with an unrelated task.
- Use `content/examples/` (or `LINKEDIA_CONTENT_DIR`) for tests; never put fixtures under `content/articles` or `content/editions`.

## Effort gate (owner rule, D-039)
- Every task in `../linkedia-engine/docs/IMPLEMENTATION_PLAN.md` has a recommended effort; `⏸` markers there show each boundary where it changes.
- Current effort = the latest `/effort` level visible in this conversation (a level passed with `claude --effort` at launch is not visible); if none is visible, the recommended effort of the task already completed in this session; if neither exists (first task), start it and state its recommended effort in your first line.
- Never start a task whose recommended effort differs from the current effort. Stop instead and reply in pt-BR:
  `⏸ Pausa: a próxima tarefa é <ID> — <título>, com esforço recomendado <nível> (atual: <nível ou "desconhecido">). Recomendado: /quit e `claude --effort <nível>` (sessão nova, contexto limpo); ou /effort <nível> aqui e responda "continuar".`
- Give this reminder once; if the owner then says to continue (switched or not), proceed.
- Chain tasks in one session only when the owner asked to continue and the effort is unchanged.
