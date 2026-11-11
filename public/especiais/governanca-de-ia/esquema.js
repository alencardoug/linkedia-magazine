// AI governance guide (3-22): applies the reader's stored light/dark pick before the first paint. A classic
// same-origin script (the CSP allows 'self'; no inline code). Without a stored pick the page follows the system.
(function () {
  var pick = null;
  try {
    pick = localStorage.getItem('linkedia.guia-ia.esquema');
  } catch (e) {
    pick = null;
  }
  if (pick === 'claro' || pick === 'escuro') document.documentElement.setAttribute('data-scheme', pick);
})();
