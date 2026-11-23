// Sprache der Servermeldungen: pro Anfrage (aus dem Header), im Terminal aus Umgebung oder --lang.
import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_LANG, normalizeLang, translate } from '../locales/index.js';

const storage = new AsyncLocalStorage();
let defaultLang = DEFAULT_LANG;

export function setDefaultLang(lang) {
  defaultLang = normalizeLang(lang) || DEFAULT_LANG;
}

/** Sprache aus Umgebungsvariablen (Terminal): COPYPASTEPILOT_LANG, LC_ALL, LC_MESSAGES, LANG. */
export function langFromEnv(env = process.env) {
  for (const name of ['COPYPASTEPILOT_LANG', 'LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const l = normalizeLang(env[name]);
    if (l) return l;
  }
  return null;
}

export const withLang = (lang, fn) => storage.run(normalizeLang(lang) || defaultLang, fn);
export const currentLang = () => storage.getStore() || defaultLang;
export const t = (key, params) => translate(currentLang(), key, params);
