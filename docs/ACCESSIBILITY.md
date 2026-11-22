# Accessibility and External Media Policy

## Images
Use meaningful `alt` text and a **separate long visual description** in `pt-BR` for informational images and diagrams, so screen-reader users can access what matters beyond a short label. When an image is decorative, use an empty alt value and no redundant description. Distinguish visual explanation from attribution: both can appear under the figure.

External imagery must have clear origin and right-to-use evidence; embedding arbitrary search results is not permission to republish. Do not hotlink from unstable or blocked providers without fallback. Prefer CSS, responsive SVG and diagram rendering for self-authored figures. SVG code must be sanitized/controlled, not model-injected script.

## Dynamic interface
Mode button keyboard-operable and announces the chosen mode. Avoid heavy animation for reduced-motion users. Full article reading must remain possible without JS. Color themes may be anything except inaccessible; maintain contrast for body text. Support 320px-class narrow layouts and avoid trapping keyboard focus in popups.

As built (V2-06, `docs/VISUAL_LAB.md`): the reading mode is one native `<button>` at the top right of the header, after the navigation in the Tab order. Its accessible name states the mode on screen ("Modo de leitura: Claro/Escuro/Preto"; the visible word is part of it, so voice control works), `aria-describedby` states the next mode, Enter and Space cycle it, focus stays on it, and a polite live region announces each change; nothing is announced on load. Narrow screens show the icon only (≥ 34 px target); the name stays. Without JS the button is hidden and out of the accessibility tree, and the system mode applies. All text in the three modes keeps ≥ 4.5:1 (the pairs are in `src/styles/site.css`); the e2e suite runs axe and the 320 px check on every kind of reading page in each mode. The 1C-01 theme switcher it replaces is retired.

## Copying prompts
Copy actions have explicit label, accessible tooltip/dialog for prompt preview, proper focus return, clipboard failure fallback and no hidden network calls.
