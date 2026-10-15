// @ts-check
import { defineConfig } from 'astro/config';

// URL shape per D-034: `/materias/slug.html` served as `/materias/slug` by Firebase cleanUrls.
export default defineConfig({
  site: 'https://linkedia.web.app', // placeholder until the Firebase site exists (O-2, P0-06)
  build: { format: 'file' },
  trailingSlash: 'never',
});
