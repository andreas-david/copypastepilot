// Konfigurationen: je eine JSON-Datei im Benutzerordner (~/.easycopy/configs), leicht zu sichern und zu teilen.
// Schema 2: eine Konfiguration besteht aus Schritten (z. B. Seite 1 und Folgeseite eines Formulars).
// Schema 1 (ein Schritt direkt in der Konfiguration) wird beim Lesen automatisch umgewandelt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { INPUT_ROLES } from './fields.js';

export const homeDir = () => process.env.EASYCOPY_HOME || path.join(os.homedir(), '.easycopy');
/** Übernimmt Konfigurationen des früheren Arbeitsnamens (~/.field-copier) einmalig in ~/.easycopy. Kopiert nur, löscht nichts. */
export function migrateLegacyHome(home = os.homedir()) {
  const oldDir = path.join(home, '.field-copier');
  const newDir = path.join(home, '.easycopy');
  if (fs.existsSync(newDir) || !fs.existsSync(oldDir)) return false;
  fs.cpSync(oldDir, newDir, { recursive: true });
  return true;
}

const configDir = () => path.join(homeDir(), 'configs');
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const MAX_STEPS = 10;

export class ValidationError extends Error {
  constructor(details) {
    super('Konfiguration ungültig');
    this.details = details;
  }
}

const isStr = (v, max) => typeof v === 'string' && v.length <= max;

function validSide(s) {
  return s && isStr(s.app, 100) && s.app.trim() !== '' && isStr(s.windowContains, 200) && s.windowContains.trim() !== '';
}

// Quelle darf auch normaler Text sein (statictext), Ziel nur ein Eingabefeld.
const SOURCE_ROLES = [...INPUT_ROLES, 'statictext'];

function validField(f, roles) {
  return f && roles.includes(f.role) && isStr(f.label, 200) && Number.isInteger(f.occurrence) && f.occurrence >= 0;
}

/** Wandelt Schema 1 (source/target/pairs an der Konfiguration) in Schema 2 (steps) um. */
export function normalize(c) {
  if (c && typeof c === 'object' && !Array.isArray(c.steps) && c.source && c.target && c.pairs) {
    const { source, target, pairs, ...rest } = c;
    return { ...rest, schema: 2, steps: [{ title: '', after: '', source, target, pairs }] };
  }
  return c;
}

function validateStep(s, label) {
  const errors = [];
  if (!s || typeof s !== 'object') return [`${label}: fehlt`];
  if (s.title !== undefined && !isStr(s.title, 100)) errors.push(`${label}: Titel ist zu lang (höchstens 100 Zeichen)`);
  if (s.after !== undefined && !isStr(s.after, 500)) errors.push(`${label}: Hinweis ist zu lang (höchstens 500 Zeichen)`);
  if (!validSide(s.source)) errors.push(`${label}: Quelle braucht Programm und Fenstertitel`);
  if (!validSide(s.target)) errors.push(`${label}: Ziel braucht Programm und Fenstertitel`);
  if (!Array.isArray(s.pairs) || !s.pairs.length || s.pairs.length > 100) errors.push(`${label}: es braucht 1 bis 100 Feldpaare`);
  else
    s.pairs.forEach((p, i) => {
      if (!validField(p?.src, SOURCE_ROLES) || !validField(p?.dst, INPUT_ROLES)) errors.push(`${label}: Feldpaar ${i + 1} ist ungültig`);
    });
  return errors;
}

export function validateConfig(input) {
  const c = normalize(input);
  const errors = [];
  if (!c || typeof c !== 'object') return ['Konfiguration fehlt'];
  if (!isStr(c.name, 100) || !c.name.trim()) errors.push('Name fehlt oder ist zu lang (höchstens 100 Zeichen)');
  if (c.help !== undefined && !isStr(c.help, 5000)) errors.push('Hilfetext ist zu lang (höchstens 5000 Zeichen)');
  if (!Array.isArray(c.steps) || !c.steps.length || c.steps.length > MAX_STEPS) errors.push(`Es braucht 1 bis ${MAX_STEPS} Schritte`);
  else c.steps.forEach((s, i) => errors.push(...validateStep(s, `Schritt ${i + 1}`)));
  return errors;
}

const cleanField = (f) => ({ role: f.role, label: f.label, occurrence: f.occurrence });
const cleanSide = (s) => ({ app: s.app.trim(), windowContains: s.windowContains.trim() });
export const cleanPairs = (pairs) => pairs.map((p) => ({ src: cleanField(p.src), dst: cleanField(p.dst) }));
const cleanStep = (s) => ({
  title: (s.title || '').trim(),
  after: (s.after || '').trim(),
  source: cleanSide(s.source),
  target: cleanSide(s.target),
  pairs: cleanPairs(s.pairs),
});

/** Fingerabdruck des technischen Teils eines Schritts (Fenster und Feldpaare). Titel und Hinweise zählen nicht. */
export function stepHash(s) {
  const t = { source: cleanSide(s.source), target: cleanSide(s.target), pairs: cleanPairs(s.pairs) };
  return crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex');
}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'konfiguration';

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function getConfig(id) {
  if (!ID_RE.test(id)) return null;
  try {
    return normalize(JSON.parse(fs.readFileSync(path.join(configDir(), `${id}.json`), 'utf8')));
  } catch {
    return null;
  }
}

export function listConfigs() {
  let names = [];
  try {
    names = fs.readdirSync(configDir()).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    const c = getConfig(n.slice(0, -5));
    if (c && !validateConfig(c).length) out.push(c);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

/** Legt an (existing = null) oder aktualisiert. Wirft ValidationError. */
export function saveConfig(rawInput, existing = null) {
  const input = normalize(rawInput);
  const errors = validateConfig(input);
  if (errors.length) throw new ValidationError(errors);
  const now = new Date().toISOString();
  const id = existing ? existing.id : `${slug(input.name)}-${crypto.randomBytes(2).toString('hex')}`;
  const config = {
    schema: 2,
    id,
    name: input.name.trim(),
    help: (input.help || '').trim(),
    steps: input.steps.map(cleanStep),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    lastRun: existing ? existing.lastRun || null : null,
  };
  writeAtomic(path.join(configDir(), `${id}.json`), config);
  return config;
}

/** Merkt sich das Ergebnis des zuletzt ausgeführten Schritts (ohne Feldinhalte). */
export function setLastRun(id, stepIndex, result) {
  const c = getConfig(id);
  if (!c) return;
  c.lastRun = {
    at: new Date().toISOString(),
    ok: result.ok,
    step: stepIndex,
    steps: c.steps.length,
    pairs: result.pairs.map((p) => ({ ok: p.ok, detail: p.detail })),
  };
  writeAtomic(path.join(configDir(), `${id}.json`), c);
}

export function deleteConfig(id) {
  if (!ID_RE.test(id)) return false;
  try {
    fs.unlinkSync(path.join(configDir(), `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
