// @ts-check
import { defineConfig } from 'astro/config';
import { cssModes } from './scripts/css-modes.mjs';

// URL shape per D-034: `/materias/slug.html` served as `/materias/slug` by Firebase cleanUrls.
// No inline CSS or JS (1B-03): the CSP in firebase.json allows only same-origin scripts and styles; the reading
// mode's pre-paint script is the same-origin file public/modo.js (V2-06), so no hash is needed. cssModes: each
// `@mode` look of src/styles/site.css on both the explicit-pick and the system-default path (V2-06b).
export default defineConfig({
  site: 'https://linkedia.web.app',
  build: { format: 'file', inlineStylesheets: 'never' },
  trailingSlash: 'never',
  vite: { build: { assetsInlineLimit: 0 }, css: { postcss: { plugins: [cssModes()] } } },
});
