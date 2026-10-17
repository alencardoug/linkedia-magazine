# minimal-dark (baseline)

The permanent Linkedia theme (D-025, `docs/VISUAL_LAB.md`). It changes only for bug or security fixes.

- **What it is:** `theme.css`, CSS only. There is no enhancement module and no JS. Reading works with JS turned off.
- **Tokens:** the custom properties on `:root[data-theme="minimal-dark"]`. They also apply under bare `:root`, so this theme is the default. A lab theme overrides them under `:root[data-theme="lab-YYYY-wWW"]`.
- **Hooks:** the stable `data-*` attributes emitted by the pages: `data-site-header`, `data-site-footer`, `data-brand`, `data-card`, `data-lead`, `data-article`, `data-summary`, `data-block`, `data-variant`, `data-tags`, `data-prompts`, `data-prompt-action`, `data-sources`, `data-about`, `data-author`, and the switcher's `data-theme-switcher`, `data-theme-option`, `data-theme-status`. Themes style these hooks and never change the markup.
- **Accessibility:**
  - AA contrast on `--bg`: text 15.0:1, muted text 7.5:1, links 8.9:1 (on `--surface`: 13.7, 6.8, 8.1);
  - a visible `:focus-visible` ring and a skip link;
  - one 68ch reading column that works from 320 px up;
  - `prefers-reduced-motion` and `forced-colors` are respected.
- **Fonts:** the system font stack only. No webfont, no CDN.
- **Switcher (1C-01):** the rules for `[data-theme-switcher]`, `[data-theme-option]`, `[data-theme-status]` and `[hidden] { display: none !important }` live here, so every lab theme inherits a readable, working switcher.
- **Reuse:** copy `theme.css` into another project and add the same `data-*` hooks to its markup.
