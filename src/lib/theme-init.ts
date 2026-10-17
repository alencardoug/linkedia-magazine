// Pre-paint theme script (D-025, 1C-01). Inlined in <head> only once lab themes exist; it applies the stored
// slot before the first paint. Keep it tiny and keep its sha256 in firebase.json `script-src`
// (tests/firebase.test.mjs computes it from this string). Same key and slot names as theme-runtime.ts.
export const THEME_STORAGE_KEY = 'linkedia:tema';

export const THEME_INIT_SCRIPT =
  '(function(){try{var r=document.documentElement,s=localStorage.getItem("linkedia:tema"),' +
  't=/^(baseline|previous|current)$/.test(s)&&r.getAttribute("data-theme-"+s);' +
  'if(t)r.setAttribute("data-theme",t)}catch(e){}})()';
