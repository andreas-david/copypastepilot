// Gemeinsame Übersetzungsfunktionen für Server, Terminal und Oberfläche (reines JavaScript, keine Abhängigkeiten).
// Schlüssel sind flach („editor.loadFields“). Platzhalter: {name}. Mehrzahl: Schlüssel.one / Schlüssel.other mit {count}.
import de from './de.js';
import en from './en.js';

export const LANGS = ['de', 'en'];
export const DEFAULT_LANG = 'en';
export const dictionaries = { de, en };

/** 'de-AT' → 'de'; unbekannt → null. */
export function normalizeLang(value) {
  const l = String(value || '').toLowerCase().split(/[-_.]/)[0];
  return LANGS.includes(l) ? l : null;
}

/** Erste unterstützte Sprache aus einem Accept-Language-Header. */
export function parseAcceptLanguage(header) {
  for (const part of String(header || '').split(',')) {
    const l = normalizeLang(part.split(';')[0].trim());
    if (l) return l;
  }
  return null;
}

/** Übersetzt einen Schlüssel. Fehlt er in der Sprache, gilt Englisch, sonst der Schlüssel selbst. */
export function translate(lang, key, params = {}) {
  const dict = dictionaries[normalizeLang(lang) || DEFAULT_LANG];
  let k = key;
  if (typeof params.count === 'number') {
    const form = new Intl.PluralRules(normalizeLang(lang) || DEFAULT_LANG).select(params.count);
    const plural = `${key}.${form === 'one' ? 'one' : 'other'}`;
    if (plural in dict || plural in dictionaries[DEFAULT_LANG]) k = plural;
  }
  const text = dict[k] ?? dictionaries[DEFAULT_LANG][k] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}
