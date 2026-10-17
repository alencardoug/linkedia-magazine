// Virtual modules of scripts/vite-themes.mjs (the slotted themes of themes/manifest.json).
declare module 'virtual:linkedia-themes/slots' {
  const slots: import('./lib/theme-runtime').ThemeSlots;
  export default slots;
}

declare module 'virtual:linkedia-themes/styles' {}

declare module 'virtual:linkedia-themes/enhancements' {
  const enhancements: Readonly<Record<string, import('./lib/theme-runtime').EnhancementEntry>>;
  export default enhancements;
}
