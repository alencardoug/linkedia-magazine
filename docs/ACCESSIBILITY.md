# Accessibility and External Media Policy

## Images
Use meaningful `alt` text and a **separate long visual description** in `pt-BR` for informational images and diagrams, so screen-reader users can access what matters beyond a short label. When an image is decorative, use an empty alt value and no redundant description. Distinguish visual explanation from attribution: both can appear under the figure.

External imagery must have clear origin and right-to-use evidence; embedding arbitrary search results is not permission to republish. Do not hotlink from unstable or blocked providers without fallback. Prefer CSS, responsive SVG and diagram rendering for self-authored figures. SVG code must be sanitized/controlled, not model-injected script.

## Dynamic interface
Theme switcher keyboard-operable and announces chosen theme. Avoid heavy animation for reduced-motion users. Full article reading must remain possible without JS. Color themes may be anything except inaccessible; maintain contrast for body text. Support 320px-class narrow layouts and avoid trapping keyboard focus in popups.

As built (1C-01): the switcher is a native radio group in a `<fieldset>` with the legend "Tema visual" (Tab enters it, arrows change the theme at once, the focus ring comes from the baseline), an unavailable slot is a disabled radio with "(ainda não há)", every change and every fallback is announced in a polite live region, and nothing is announced on page load. Without JS it stays hidden and the page reads in the build-time default theme. An enhancement needing motion is never loaded under `prefers-reduced-motion: reduce`. A lab theme cannot hide the switcher in practice: the e2e suite checks it is visible in every slot, and the baseline's `[hidden] { display: none !important }` keeps it out of no-JS pages.

## Copying prompts
Copy actions have explicit label, accessible tooltip/dialog for prompt preview, proper focus return, clipboard failure fallback and no hidden network calls.
