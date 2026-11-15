// Felder lesen und kopieren. Portiert aus dem Python-Runner; gleiches Verhalten, gleiche Zähl-Nummern.
import { ad, AgentError } from './agent.js';
import { selectTab } from './windows.js';

export const INPUT_ROLES = ['textfield', 'textarea', 'combobox', 'checkbox', 'radiobutton', 'slider', 'switch', 'stepper'];
const TEXT_ROLES = ['statictext']; // Überschriften: ihr Text steckt in untergeordnetem statictext (value wäre nur die Ebene)
const MAX_ITEMS = 2000;
const MAX_VALUE = 300;

async function snapshotTree(app, wid, interactive) {
  const args = ['snapshot', '--app', app, '--window-id', wid];
  if (interactive) args.push('-i');
  args.push('--max-depth', 40, '--compact', '--timeout-ms', 30000);
  return (await ad(args, 90000)).tree;
}

function hasWeb(n) {
  return n.role === 'webarea' || (n.children || []).some(hasWeb);
}

/**
 * Liefert { node, context, occurrence } für Eingabefelder (occurrence = Zähl-Nummer) und Texte (occurrence null).
 * Zähl-Nummer: die wievielte Eingabe mit gleicher Rolle und Beschriftung (0, 1, …). Scan, Prüfung und Kopieren
 * nutzen dieselbe Funktion, damit die Nummern übereinstimmen.
 */
function iterScope(tree) {
  const webOnly = hasWeb(tree); // bei Browsern nur die Webseite, nicht Adressleiste und Tabs
  const rootName = tree.name || '';
  const counters = new Map();
  function* walk(n, inWeb, trail) {
    const role = n.role || '';
    inWeb = inWeb || role === 'webarea';
    const name = n.name || '';
    if (inWeb || !webOnly) {
      const context = trail.slice(-2).join(' › ').slice(0, 200);
      if (INPUT_ROLES.includes(role)) {
        const key = `${role}\u0000${name}`;
        const occ = counters.get(key) || 0;
        counters.set(key, occ + 1);
        yield { node: n, context, occurrence: occ, isText: false };
      } else if (TEXT_ROLES.includes(role)) {
        // Texte haben keine Beschriftung: Kennung = Umgebung + wievielter Text dort (0, 1, …).
        const key = `T\u0000${context}`;
        const occ = counters.get(key) || 0;
        counters.set(key, occ + 1);
        yield { node: n, context, occurrence: occ, isText: true };
      }
    }
    // Der Fenstertitel (oft auch ein Container gleichen Namens) ändert sich mit der Seite und taugt nicht als Kennung.
    const next = name && name !== rootName && ['group', 'article', 'tabpanel', 'table', 'list'].includes(role) ? [...trail, name] : trail;
    for (const c of n.children || []) yield* walk(c, inWeb, next);
  }
  return { webOnly, items: walk(tree, false, []) };
}

export const fieldKey = (f) => `${f.role}\u0000${f.label}\u0000${f.occurrence}`;

/** Alle Felder mit Inhalt (Quelle) bzw. auch leere (Ziel). Passwortfelder werden nie gelesen. */
async function scanFieldsRaw(app, wid, includeEmpty, tab = null) {
  await bringToFront(app, wid, tab); // verdeckte Chrome-Fenster liefern teils falsche Werte (beobachtet: "0", "1")
  const { webOnly, items: scope } = iterScope(await snapshotTree(app, wid, false));
  const items = [];
  let empty = 0;
  let truncated = false;
  for (const { node: n, context, occurrence, isText } of scope) {
    if (items.length >= MAX_ITEMS) {
      truncated = true;
      break;
    }
    const role = n.role || '';
    const name = n.name || '';
    if (isText) {
      const text = n.value || name;
      // Beschriftung eines Textes = seine Umgebung (so wird er wiedergefunden), dazu die Zähl-Nummer darin
      if (text) items.push({ kind: 'text', role, label: context, value: String(text).slice(0, MAX_VALUE), context, secure: false, occurrence });
      continue;
    }
    const base = { kind: 'input', role, label: name, context, occurrence };
    if ((n.states || []).includes('secure')) items.push({ ...base, value: '(Passwortfeld, nicht gelesen)', secure: true });
    else if (n.value !== null && n.value !== undefined && n.value !== '') items.push({ ...base, value: String(n.value).slice(0, MAX_VALUE), secure: false });
    else if (includeEmpty) items.push({ ...base, value: '', secure: false });
    else empty += 1;
  }
  return { items, emptyInputs: empty, truncated, webOnly };
}

/** Alle Eingabefelder eines Fensters als Map Schlüssel → { ref, value, secure }. */
export async function collectInputs(app, wid) {
  const { items } = iterScope(await snapshotTree(app, wid, true));
  const found = new Map();
  for (const { node: n, occurrence, isText } of items) {
    if (isText) continue;
    found.set(fieldKey({ role: n.role || '', label: n.name || '', occurrence }), {
      ref: n.ref_id,
      value: n.value,
      secure: (n.states || []).includes('secure'),
    });
  }
  return found;
}

/**
 * Quelle: Eingabefelder UND normale Texte. Texte stecken nur im vollständigen Snapshot (ohne -i),
 * deshalb wird hier nicht-interaktiv gelesen. Schlüssel eines Textes: Rolle statictext, Umgebung, Zähl-Nummer.
 */
export async function collectSource(app, wid) {
  const { items } = iterScope(await snapshotTree(app, wid, false));
  const found = new Map();
  for (const { node: n, context, occurrence, isText } of items) {
    if (isText) {
      found.set(fieldKey({ role: n.role || 'statictext', label: context, occurrence }), { ref: null, value: n.value || n.name || '', secure: false });
    } else {
      found.set(fieldKey({ role: n.role || '', label: n.name || '', occurrence }), {
        ref: n.ref_id,
        value: n.value,
        secure: (n.states || []).includes('secure'),
      });
    }
  }
  return found;
}

const describe = (f) =>
  f.role === 'statictext' ? `Text Nr. ${f.occurrence + 1}${f.label ? ` in „${f.label}“` : ''}` : `„${f.label || '(ohne Beschriftung)'}“`;

/** Prüft ohne zu schreiben, welche Feldpaare in den beiden Fenstern vorhanden sind. */
export async function checkPairs(src, dst, pairs, { passive = false } = {}) {
  // Passiv (wiederholte Bereitschaftsprüfung): Hintergrund-Tabs werden nicht umgeschaltet, das würde dauernd flackern.
  if (passive && (src.tab || dst.tab)) return { total: pairs.length, problems: [], skipped: true };
  const inner = async () => {
    // Liegt eine Seite in einem Hintergrund-Tab, wird der Tab kurz nach vorn geholt (danach wieder zurück).
    if (src.tab) await frontTab(src);
    const s = await collectSource(src.app, src.id);
    if (dst.tab) await frontTab(dst);
    return [s, await collectInputs(dst.app, dst.id)];
  };
  const [s, d] = src.tab || dst.tab ? await preserveFocus(inner) : await inner();
  const problems = [];
  for (const p of pairs) {
    const sf = s.get(fieldKey(p.src));
    const df = d.get(fieldKey(p.dst));
    if (!sf) problems.push(`Quelle ${describe(p.src)} fehlt`);
    else if (sf.secure) problems.push(`Quellfeld ${describe(p.src)} ist ein Passwortfeld`);
    if (!df || !df.ref) problems.push(`Zielfeld ${describe(p.dst)} fehlt`);
    else if (df.secure) problems.push(`Zielfeld ${describe(p.dst)} ist ein Passwortfeld`);
  }
  return { total: pairs.length, problems };
}

/** Das Fenster, das gerade vorn ist (bei der Einrichtung: die Seite von CopyPastePilot). Nur Best-Effort. */
async function focusedWindow() {
  try {
    const wins = (await ad(['list-windows', '--timeout-ms', 8000], 30000)) || [];
    return wins.find((w) => w.is_focused) || null;
  } catch {
    return null;
  }
}

/** Führt fn aus (darf Fenster nach vorn holen) und bringt danach das vorherige Fenster wieder nach vorn. */
let tabRestores = null; // während preserveFocus: Tabs, die zurückgestellt werden müssen

async function frontTab(e) {
  const prev = await selectTab(e.app, e.id, e.tab);
  if (prev && tabRestores) tabRestores.push({ app: e.app, id: e.id, title: prev });
}

async function preserveFocus(fn) {
  const before = await focusedWindow();
  const outer = tabRestores;
  tabRestores = [];
  try {
    return await fn();
  } finally {
    const todo = tabRestores.reverse();
    tabRestores = outer;
    for (const t of todo) {
      try {
        await selectTab(t.app, t.id, t.title);
      } catch {
        /* Tab geschlossen o. Ä. */
      }
    }
    if (before) {
      try {
        await ad(['focus-window', '--app', before.app_name, '--window-id', before.id], 20000);
      } catch {
        /* Fenster weg o. Ä.: nichts zu tun */
      }
    }
  }
}

export const scanFields = (app, wid, includeEmpty = false, tab = null) => preserveFocus(() => scanFieldsRaw(app, wid, includeEmpty, tab));
export const copyFields = (src, dst, pairs) => preserveFocus(() => copyFieldsRaw(src, dst, pairs));

async function bringToFront(app, wid, tab = null) {
  // Chrome & Co. verarbeiten Eingaben in verdeckten Fenstern nicht zuverlässig.
  try {
    await ad(['focus-window', '--app', app, '--window-id', wid], 20000);
  } catch {
    /* trotzdem versuchen; ein Fehlschlag zeigt sich beim Schreiben mit Hinweis */
  }
  if (tab) await frontTab({ app, id: wid, tab });
}

const readValue = (d) => {
  const v = d && typeof d === 'object' ? (d.value ?? d.text) : d;
  return v === null || v === undefined ? '' : String(v);
};

/** Kopiert Feld für Feld: lesen, ins Ziel schreiben, zurücklesen und vergleichen. Werte verlassen den Rechner nicht. */
async function copyFieldsRaw(src, dst, pairs) {
  await bringToFront(src.app, src.id, src.tab);
  const s = await collectSource(src.app, src.id);
  await bringToFront(dst.app, dst.id, dst.tab);
  const d = await collectInputs(dst.app, dst.id);
  const results = [];
  for (const p of pairs) {
    const sf = s.get(fieldKey(p.src));
    const df = d.get(fieldKey(p.dst));
    try {
      if (!sf) throw new AgentError('Quellfeld nicht gefunden');
      if (!df || !df.ref) throw new AgentError('Zielfeld nicht gefunden');
      if (sf.secure || df.secure) throw new AgentError('Passwortfelder werden nicht kopiert');
      const value = sf.value === null || sf.value === undefined ? '' : String(sf.value);
      await ad(['set-value', df.ref, value]);
      const back = readValue(await ad(['get', df.ref, '--property', 'value']));
      if (back !== value) throw new AgentError('Zielfeld zeigt nach dem Schreiben einen anderen Wert');
      results.push({ ok: true, detail: 'kopiert und geprüft' });
    } catch (e) {
      let msg = e.message;
      if (msg.includes('does not match the requested change')) msg = 'Zielfeld hat den Wert nicht übernommen (Sind beide Fenster sichtbar und nicht verdeckt?)';
      results.push({ ok: false, detail: msg });
    }
  }
  return { ok: results.length > 0 && results.every((r) => r.ok), pairs: results };
}
