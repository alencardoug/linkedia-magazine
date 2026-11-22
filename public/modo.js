// Reading mode (V2-06, D-081): applies the reader's stored light/dark/black pick before the first paint. A classic
// same-origin script loaded blocking in <head> (the CSP allows 'self'; no inline code, no hash). Without a valid
// stored pick nothing is set and the CSS follows the system (never black). Same key and values as src/lib/mode.ts.
(function () {
  var pick = null;
  try {
    pick = localStorage.getItem('linkedia:modo:v1');
  } catch (e) {
    pick = null;
  }
  if (pick === 'light' || pick === 'dark' || pick === 'black') document.documentElement.setAttribute('data-mode', pick);
})();
