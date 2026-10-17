// @ts-check
import { defineConfig } from 'astro/config';

// URL shape per D-034: `/materias/slug.html` served as `/materias/slug` by Firebase cleanUrls.
// No inline CSS or JS (1B-03): the CSP in firebase.json allows only same-origin scripts and styles.
export default defineConfig({
  site: 'https://linkedia.web.app',
  build: { format: 'file', inlineStylesheets: 'never' },
  trailingSlash: 'never',
  vite: { build: { assetsInlineLimit: 0 } },
});
