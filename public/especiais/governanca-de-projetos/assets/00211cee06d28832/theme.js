(() => {
  const key = 'linkedia.gov-projetos.tema';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const browserColor = document.querySelector('meta[name="theme-color"]');
  let picker;
  let preference;

  function readPreference() {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function apply(value) {
    preference = value === 'light' || value === 'dark' ? value : 'system';
    if (preference === 'system') delete root.dataset.theme;
    else root.dataset.theme = preference;
    if (picker) picker.value = preference;

    const dark = preference === 'dark' || (preference === 'system' && system.matches);
    if (browserColor) browserColor.content = dark ? '#141b18' : '#f6f5ef';
  }

  apply(readPreference());
  system.addEventListener('change', () => apply(preference));
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(readPreference());
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) apply(readPreference());
  });

  document.addEventListener('DOMContentLoaded', () => {
    picker = document.getElementById('theme-preference');
    if (!picker) return;
    picker.value = preference;
    picker.closest('label').hidden = false;
    picker.addEventListener('change', () => {
      apply(picker.value);
      try {
        if (preference === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, preference);
      } catch {
        // A seleção continua valendo nesta página.
      }
    });
  });
})();
