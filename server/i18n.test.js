import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries, LANGS, normalizeLang, parseAcceptLanguage, translate } from '../locales/index.js';
import { t, withLang, langFromEnv } from './i18n.js';

test('alle Sprachen haben dieselben Schlüssel', () => {
  const keys = (l) => Object.keys(dictionaries[l]).sort();
  for (const l of LANGS) assert.deepEqual(keys(l), keys('de'), `Schlüssel von ${l} weichen von de ab`);
});

test('in jeder Sprache stehen dieselben Platzhalter', () => {
  const ph = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
  for (const key of Object.keys(dictionaries.de)) {
    for (const l of LANGS) assert.equal(ph(dictionaries[l][key]), ph(dictionaries.de[key]), `${key} (${l})`);
  }
});

test('Platzhalter und Mehrzahl', () => {
  assert.equal(translate('de', 'check.fieldsAll', { total: 4 }), '4 von 4 Feldern vorhanden');
  assert.equal(translate('en', 'check.fieldsDeferred', { count: 1 }), '1 field: checked when running');
  assert.equal(translate('en', 'check.fieldsDeferred', { count: 3 }), '3 fields: checked when running');
  assert.equal(translate('de', 'check.fieldsDeferred', { count: 1 }), '1 Feld: Prüfung erst beim Ausführen');
});

test('unbekannte Sprache und Schlüssel fallen zurück', () => {
  assert.equal(translate('fr', 'http.notFound'), 'Not found');
  assert.equal(translate('en', 'gibt.es.nicht'), 'gibt.es.nicht');
});

test('Sprache erkennen', () => {
  assert.equal(normalizeLang('de-AT'), 'de');
  assert.equal(normalizeLang('EN_us.UTF-8'), 'en');
  assert.equal(normalizeLang('fr'), null);
  assert.equal(parseAcceptLanguage('fr-CH, fr;q=0.9, de;q=0.8, en;q=0.7'), 'de');
  assert.equal(langFromEnv({ LANG: 'de_DE.UTF-8' }), 'de');
  assert.equal(langFromEnv({ LC_ALL: 'en_GB', LANG: 'de_DE' }), 'en');
  assert.equal(langFromEnv({}), null);
});

test('withLang gilt auch über asynchrone Grenzen hinweg', async () => {
  const msg = await withLang('de', async () => {
    await new Promise((r) => setTimeout(r, 5));
    return t('http.notFound');
  });
  assert.equal(msg, 'Nicht gefunden');
  assert.equal(await withLang('en', async () => t('http.notFound')), 'Not found');
});

test('alle im Code verwendeten Schlüssel gibt es in den Sprachdateien', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|svelte)$/.test(f.name) && !f.name.endsWith('.test.js')) files.push(p);
    }
  };
  for (const d of ['server', 'bin', 'web/src']) walk(path.join(root, d));
  const prefixes = 'ui|http|v|check|run|problem|copy|win|cfg|agent|side|field|cli';
  const re = new RegExp(`['"\`]((?:${prefixes})\\.[A-Za-z.]+)['"\`]`, 'g');
  const missing = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) {
      const k = m[1];
      if (!(k in dictionaries.de) && !(`${k}.one` in dictionaries.de)) missing.push(`${path.relative(root, f)}: ${k}`);
    }
  }
  assert.deepEqual(missing, []);
});
