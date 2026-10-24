# Cover Art — the owner's brief (keep forever; read before any work on the cover)

Recorded 2026-10-17. Planned task: `3-01 · Cover art pre-page` (planning at maximum effort, Claude + Codex).

## What the owner asked for
A **pre-page (cover)** before the magazine's home page that is pure technological art with **no limits**. The reading pages stay as they are (fonts, colours, accessibility, legibility); the cover is the opposite: the place where the owner wants to look and think *"isso é incrivelmente diferente"*.

- It may play with the word **LinkedIA** and its variations (Linked-ia, Liked IA… free to explore), or have no word at all if that is better.
- **One click anywhere enters the magazine**: on the word, or — without a word — on a floating ball that changes colour, a robotic insect walking, anywhere on a moving futuristic dotted background… any element, any place.
- Anything technological and impressive: interface, abstract sculpture, generative art, a combination of technologies and languages, Claude's own creativity — it must **impact**.
- Erring and going overboard is fine: minimal, medium, maximal, extremely colourful, nonsensical, extravagant. It is art and technology (or not). **Anything goes for the art and to show how powerful AI is, artistically too.**
- The weekly themes (D-063/D-064) proved readable but, in the owner's words, were "only a page with text, colours, fonts" — the wish for an incredible visual was not met there. Readability rules stay for the magazine; the cover is where that wish is met.

## Owner's words (pt-BR, verbatim)
> O meu desejo de ter um visual incrível não foi realizado, na minha avaliação. Somente vi uma página com texto, cores, fontes. E tudo bem, entendo que precisa viabilizar a leitura. Você acertou e vamos continuar assim. Mas quero viabilizar minha ideia de interface incrível, e será numa pré página livre que não tem nenhuma limitação. […] Esta pré página é para uma arte, uma interface incrível, uma escultura abstrata, literalmente QUALQUER COISA TECNOLÓGICA E IMPRESSIONANTE, que use os recursos de códigos, linguagens de programação, combinação/soma de tecnologias, criatividade sua, mas que impacte. Está tudo bem errar e ficar exagerado, mínimo, médio, máximo, extremamente colorido, sem sentido, extravagante. É arte e tecnológico (ou não). VALE TUDO pela arte e para exibir o quanto a IA é poderosa, inclusive artisticamente. E para as outras páginas da revista, tudo bem se limitar a fonts de texto, cores, acessibilidade e facilidade de leitura. Mas na capa, espero olhar e pensar "isso é incrivelmente diferente".

## For whoever builds it
- Ambition first: do not default to a tasteful gradient or a text effect. Aim for something a visitor has never seen on a magazine site.
- The art itself has no aesthetic limits. What stays non-negotiable is only what keeps the site usable and safe: the magazine stays reachable (one click/tap/key anywhere, a visible skip link for keyboard and screen-reader users), the home's real content is not hidden from crawlers or readers who skip the cover, the site's security rules (CSP, no third-party trackers) hold, and the art must not lock up weak devices.

## Covers so far
| Week | Cover | Notes |
|---|---|---|
| 2026-W43 | **Duas sombras** (`/visual/duas-sombras`, `src/covers/duas-sombras/`) | Codex's concept #1, built by Claude with Codex's plan critique (one rigid object, words readable from the start, a coverage margin). A glass block of ceramic blades, carved for each edition, casts exactly "IA" and "DIA" on two walls; it follows the cursor or the finger, the follow-spots track it, and on entry the shadows swallow the room. Strong rotations smear both words into blocks, so the block only leans a few degrees. |
| 2026-W42 | **Singularidade** (`/visual/singularidade`, `src/covers/singularidade/`) | Chosen by the owner over three Codex concepts. A real-time general-relativity black hole bends the light of the typographic cover; it follows the cursor or the finger and swallows the screen on entry. The owner prefers ONE hole that follows the cursor (no companion hole, no hole parked on "IA"). |

The owner (2026-10-17) wants a new cover **every week** and every past cover easily reachable (`/visual`, was `/capas`; D-067). The
routine: `docs/prompts/weekly_cover.md`; the cover contract: `docs/COVERS.md`.

## Queue (owner, 2026-10-17: to build and show in the coming weeks)
Codex's concepts from the 3-01 brainstorm, in the owner's order. The full brainstorm (ten concepts, three wild cards,
a detailed spec of "Duas sombras") is kept in the engine checkout: `../linkedia-engine/ideas/cover_ideas_2026-10-17.md`.
1. ~~**Duas sombras / The Day Has Two Shadows**~~ — built as the 2026-W43 cover (see above).
2. **Tear do avesso / Inside-Out Loom** — today's articles as monumental coral, cobalt and yellow ribbons weaving
   through impossible crossings, headlines printed on their undersides, "LinkedIA" woven into the selvedge; Canvas 2D,
   strong on weak phones.
3. **Bicho de intervalo / Creature of the Gaps** — the counters of the masthead (the hole in the "d", the gap in the
   "A") become a jointed creature walking inside the letters, with inverse kinematics and planted feet; it looks at
   the pointer.
Further ideas from the same brainstorm (unordered): a self-repairing neural material (neural cellular automaton),
the room with no outside (portals), optical smuggling (lenticular), assembly of brushes, fruit for machines, the
disobedient fold (kirigami), memory of what hasn't happened (swept surfaces); wild cards: 4,096 staplers, the edition
that laid an egg, a cathedral of spoons.
