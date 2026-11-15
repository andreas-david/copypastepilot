import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
process.env.COPYPASTEPILOT_HOME = home;
const { normalize, validateConfig, stepHash, saveConfig, getConfig, listConfigs, setLastRun, MAX_STEPS } = await import('./configs.js');

const field = (label, role = 'textfield', occurrence = 0) => ({ role, label, occurrence });
const step = (extra = {}) => ({
  source: { app: 'Google Chrome', windowContains: 'Quelle' },
  target: { app: 'Google Chrome', windowContains: 'Ziel' },
  pairs: [{ src: field('Name'), dst: field('Vollständiger Name') }],
  ...extra,
});

test('Schema 1 wird zu einer Konfiguration mit einem Schritt', () => {
  const legacy = { schema: 1, id: 'alt-1234', name: 'Alt', help: '', ...step() };
  const n = normalize(legacy);
  assert.equal(n.schema, 2);
  assert.equal(n.steps.length, 1);
  assert.deepEqual(n.steps[0].pairs, legacy.pairs);
  assert.equal(n.source, undefined);
  assert.deepEqual(validateConfig(legacy), []);
});

test('Validierung: Schrittzahl, Felder, Text nur als Quelle', () => {
  const ok = { name: 'X', steps: [step(), step()] };
  assert.deepEqual(validateConfig(ok), []);
  assert.ok(validateConfig({ name: 'X', steps: [] }).length);
  assert.ok(validateConfig({ name: 'X', steps: Array.from({ length: MAX_STEPS + 1 }, () => step()) }).length);
  assert.ok(validateConfig({ name: '', steps: [step()] }).length);
  const textSource = step({ pairs: [{ src: field('', 'statictext'), dst: field('Ziel') }] });
  assert.deepEqual(validateConfig({ name: 'X', steps: [textSource] }), []);
  const textTarget = step({ pairs: [{ src: field('Name'), dst: field('', 'statictext') }] });
  assert.ok(validateConfig({ name: 'X', steps: [textTarget] }).length);
});

test('Fingerabdruck ignoriert Titel und Hinweis, nicht die Zuordnung', () => {
  const a = stepHash(step({ title: 'A', after: 'Weiter klicken' }));
  assert.equal(a, stepHash(step({ title: 'B', after: '' })));
  const other = step({ pairs: [{ src: field('E-Mail'), dst: field('Mail') }] });
  assert.notEqual(a, stepHash(other));
});

test('Speichern, Lesen, Auflisten und letzter Lauf', () => {
  const c = saveConfig({ name: 'Zwei Seiten', help: ' Hilfe ', steps: [step({ title: 'Seite 1' }), step({ title: 'Seite 2', after: 'Weiter' })] });
  assert.equal(c.schema, 2);
  assert.equal(c.help, 'Hilfe');
  assert.equal(getConfig(c.id).steps.length, 2);
  assert.equal(listConfigs().length >= 1, true);
  setLastRun(c.id, 1, { ok: true, pairs: [{ ok: true, detail: 'kopiert und geprüft' }] });
  const again = getConfig(c.id);
  assert.equal(again.lastRun.step, 1);
  assert.equal(again.lastRun.steps, 2);
});

test('Alte Datei auf der Platte wird beim Lesen umgewandelt', () => {
  const dir = path.join(home, 'configs');
  fs.mkdirSync(dir, { recursive: true });
  const legacy = { schema: 1, id: 'alte-datei-ab12', name: 'Alte Datei', help: '', ...step(), createdAt: 'x', updatedAt: 'x', lastRun: null };
  fs.writeFileSync(path.join(dir, 'alte-datei-ab12.json'), JSON.stringify(legacy));
  const c = getConfig('alte-datei-ab12');
  assert.equal(c.steps.length, 1);
  assert.ok(listConfigs().some((x) => x.id === 'alte-datei-ab12'));
});

test('Ungültige IDs (Pfadtricks) werden abgelehnt', () => {
  assert.equal(getConfig('../etc/passwd'), null);
  assert.equal(getConfig('A/B'), null);
});

test('migrateLegacyHome kopiert den alten Ordner einmalig', async () => {
  const { migrateLegacyHome } = await import('./configs.js');
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-home-'));
  fs.mkdirSync(path.join(h, '.field-copier', 'configs'), { recursive: true });
  fs.writeFileSync(path.join(h, '.field-copier', 'configs', 'a.json'), '{}');
  assert.equal(migrateLegacyHome(h), '.field-copier');
  assert.ok(fs.existsSync(path.join(h, '.copypastepilot', 'configs', 'a.json')));
  assert.ok(fs.existsSync(path.join(h, '.field-copier', 'configs', 'a.json')));
  assert.equal(migrateLegacyHome(h), null);
});

test('migrateLegacyHome bevorzugt .easycopy vor .field-copier', async () => {
  const { migrateLegacyHome } = await import('./configs.js');
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-home-'));
  for (const d of ['.easycopy', '.field-copier']) {
    fs.mkdirSync(path.join(h, d, 'configs'), { recursive: true });
    fs.writeFileSync(path.join(h, d, 'configs', d + '.json'), '{}');
  }
  assert.equal(migrateLegacyHome(h), '.easycopy');
  assert.ok(fs.existsSync(path.join(h, '.copypastepilot', 'configs', '.easycopy.json')));
});
