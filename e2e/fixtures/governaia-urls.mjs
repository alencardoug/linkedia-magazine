// Old magazine URLs of the AI guide and its showcase → their pages on the guide's own site (V2-13b; gia `docs/URLS.md`).
export const ROUTE = '/especiais/governanca-de-ia';
export const SHOWCASE = '/especiais/dez-layouts-governanca-de-ia';
export const SITE = 'https://governaia.web.app';
// The pre-paint script an old page opened or cached before the switch still loads: it stays served here (a redirect
// to another origin would be blocked by the CSP's `script-src 'self'`), byte for byte.
export const SCHEME_SCRIPT = `${ROUTE}/esquema.js`;
export const SCHEME_SCRIPT_SHA256 = '4dffcfd7be372957cd6e26d87f6d435e668c218d15237078caf8c27e4ab46372';
export const OLD_TO_NEW = {
  [ROUTE]: `${SITE}/`,
  [`${ROUTE}.html`]: `${SITE}/`,
  [`${ROUTE}/`]: `${SITE}/`,
  [`${ROUTE}/index.html`]: `${SITE}/`,
  [SHOWCASE]: `${SITE}/dez-layouts`,
  [`${SHOWCASE}.html`]: `${SITE}/dez-layouts`,
  [`${SHOWCASE}/`]: `${SITE}/dez-layouts`,
};
