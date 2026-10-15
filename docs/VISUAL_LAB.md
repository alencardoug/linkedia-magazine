# Weekly Visual Laboratory

## A theme is a reusable software asset
Every experiment gets `themes/lab-YYYY-wWW/` (e.g. `themes/lab-2026-w43/`, theme id `lab-2026-w43`) with code, scoped styles, demo page, `README.md`, references/licenses, before/after screenshots (can remain in the private design archive if binaries), `theme.json`, accessibility notes, responsive behavior, performance notes, test references, portability instructions and source Git commit/tag. Public deployment ships only assets needed for active and previous theme, unless history pages require more.

## Theme contract (engine decision D-025)
- Every theme renders the same semantic, theme-agnostic markup; stable hooks are `data-*` attributes and CSS custom properties (design tokens).
- A theme = CSS scoped under `:root[data-theme="<id>"]` + an optional enhancement module, dynamically imported only when that theme is active and the device allows it (no reduced motion, WebGL available, etc.).
- Themes never change article content DOM, never fetch data and never block reading; any runtime error falls back to `minimal-dark`.
- `minimal-dark` is CSS-only and fully readable without JS.
- The stored choice is applied before first paint by a tiny inline script; without JS the build-time default applies.

## Immutable baseline and rotating slots
Permanent: `themes/minimal-dark` (dark, readable, unchanged except bug/security fixes). On week rollover, **previous** points to last week's current experiment, and **current** points to the new experiment. Once the first experiment exists the selector exposes exactly 3 controls and defaults to current (before that: no selector; with a single experiment the previous slot is shown disabled). The choice may persist in `localStorage` (wrapped in try/catch) with a safe default. All earlier themes remain in Git and can be reused in other projects.

## Free creative brief
One new theme per ISO week maximum. The weekly concept may redesign the whole site or one element; experiments can be minimalist, vibrant, light, dark, procedural, 3D, shader-rich, WebGL or text-led. Search external inspiration, attribute sources and use original implementation. Avoid visual novelty that makes articles inaccessible.

## Quality gates
Keyboard, touch, screen readers, reduced motion, forced colors/high contrast where possible, small viewport, loading/fallback when 3D unsupported, Core Web Vitals budget, responsive reading contrast and no layout shift. A theme that fails gates must not replace baseline: keep new theme disabled until fixed.

## Optional dependencies
Start with Astro + CSS; add React and Motion only inside a theme that needs them. Bring Three.js, React Three Fiber or shaders ONLY when the specific week's concept needs them; lazy-load code and avoid adding them to the baseline bundle. Document alternative when WebGL is disabled.

## Reuse recipe
Provide instructions for extracting an experiment into another React/Astro project, minimal dependencies, design tokens, interfaces, lifecycle/canvas cleanup and licensing. Store screenshot references with the Git release/tag even if screenshot binary is not published.
