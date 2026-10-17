// @ts-check
import { defineConfig } from 'astro/config';
import { linkediaThemes } from './scripts/vite-themes.mjs';

// URL shape per D-034: `/materias/slug.html` served as `/materias/slug` by Firebase cleanUrls.
// No inline CSS or JS (1B-03): the CSP in firebase.json allows only same-origin scripts and styles, plus the
// hashed pre-paint theme script (1C-01). linkediaThemes: the slotted themes of themes/manifest.json.
export default defineConfig({
  site: 'https://linkedia.web.app',
  build: { format: 'file', inlineStylesheets: 'never' },
  trailingSlash: 'never',
  vite: { build: { assetsInlineLimit: 0 }, plugins: [linkediaThemes()] },
});
