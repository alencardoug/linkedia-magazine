# Linkedia — magazine

Static site of Linkedia, a Brazilian Portuguese daily magazine about AI engineering, AI leadership and broader AI knowledge. Articles are generated with AI from the sources they cite and selected by a human editor; every article lists its sources.

Built with Astro and deployed to Firebase Hosting. Content lives in `content/` as JSON validated against `contracts/` at build time; there is no backend. Each week the site also hosts one visual-interface experiment next to two fixed themes (the minimal dark baseline and Broadsheet), and a new interactive cover at `/` (every cover stays at `/visual`, with the theme choice; the old `/capas` addresses redirect there; `docs/COVERS.md`).

**Status:** under construction — no edition published yet.

## Development
Node 24 (`.nvmrc`).

```
npm ci
npm run check      # astro check (TypeScript strict)
npm test           # Vitest
npm run build      # validates content/ first (prebuild), then builds dist/
npm run validate -- --dir content/examples   # validate another content dir
npm run gen:types  # regenerate src/types/contracts.d.ts after a contract change
```

`content/examples/` mirrors the real layout (`articles/`, `editions/`, `tags/catalog.json`) and holds fictional fixtures only.

## License
Code: MIT (`LICENSE`). Editorial content in `content/`: CC BY 4.0 (`LICENSE-CONTENT`).
