# Accessibility and External Media Policy

## Images
Use meaningful `alt` text and a **separate long visual description** in `pt-BR` for informational images and diagrams, so screen-reader users can access what matters beyond a short label. When an image is decorative, use an empty alt value and no redundant description. Distinguish visual explanation from attribution: both can appear under the figure.

External imagery must have clear origin and right-to-use evidence; embedding arbitrary search results is not permission to republish. Do not hotlink from unstable or blocked providers without fallback. Prefer CSS, responsive SVG and diagram rendering for self-authored figures. SVG code must be sanitized/controlled, not model-injected script.

## Dynamic interface
Theme switcher keyboard-operable and announces chosen theme. Avoid heavy animation for reduced-motion users. Full article reading must remain possible without JS. Color themes may be anything except inaccessible; maintain contrast for body text. Support 320px-class narrow layouts and avoid trapping keyboard focus in popups.

## Copying prompts
Copy actions have explicit label, accessible tooltip/dialog for prompt preview, proper focus return, clipboard failure fallback and no hidden network calls.
