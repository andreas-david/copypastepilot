// Darstellung: 'auto' (Systemeinstellung), 'light' oder 'dark'. Die Wahl bleibt im Browser gespeichert.
const KEY = 'ec-theme';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
}

export function setTheme(t) {
  try {
    if (t === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* Speicher gesperrt: gilt nur für diese Sitzung */
  }
  applyTheme(t);
}
