// Sprache der Oberfläche: aus dem Browser, per Schalter änderbar, im Browser gespeichert.
import { get, writable, derived } from 'svelte/store';
import { LANGS, normalizeLang, translate } from '../../locales/index.js';

const KEY = 'cpp-lang';
export { LANGS };

function initial() {
  try {
    const saved = normalizeLang(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch { /* Speicher gesperrt */ }
  for (const l of navigator.languages || [navigator.language]) {
    const n = normalizeLang(l);
    if (n) return n;
  }
  return 'en';
}

export const lang = writable(initial());
/** In Komponenten: $t('schlüssel', { name }) */
export const t = derived(lang, ($lang) => (key, params) => translate($lang, key, params));

lang.subscribe((l) => {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
});

export function setLang(l) {
  const n = normalizeLang(l) || 'en';
  try { localStorage.setItem(KEY, n); } catch { /* gilt nur für diese Sitzung */ }
  lang.set(n);
}

/** Außerhalb von Komponenten. */
export const tNow = (key, params) => translate(get(lang), key, params);
