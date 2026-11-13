import { ad, AgentError } from './agent.js';

const area = (w) => (w.bounds?.width || 0) * (w.bounds?.height || 0);

export async function listApps() {
  const d = await ad(['list-apps'], 30000);
  const names = new Set((d?.apps || []).filter((a) => a.presentation === 'foreground' && a.name).map((a) => a.name));
  return [...names].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
}

// Browser, deren Tabs als Auswahlknöpfe in einer Tab-Leiste stehen (getestet: Chrome).
const TAB_APPS = /chrome|chromium|edge|brave|vivaldi|opera|arc|safari|firefox/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Entfernt Zusätze, die Chrome an Tab-Namen hängt („– Hohe Arbeitsspeichernutzung – 831 MB“). Sonst ändert sich der Name ständig. */
export function cleanTabTitle(raw) {
  // Chrome setzt teils geschützte Leerzeichen (U+00A0, U+202F) um den Gedankenstrich und in „29,9 MB“.
  let t = String(raw || '').replace(/[\u00a0\u202f]/g, ' ');
  const noise = /arbeitsspeicher|memory usage|^\s*[\d.,]+\s?(kb|mb|gb)\s*$/i;
  for (;;) {
    const i = t.lastIndexOf(' – ');
    if (i < 0 || !noise.test(t.slice(i + 3))) break;
    t = t.slice(0, i);
  }
  return t.trim();
}

/** Tabs eines Browserfensters: [{ ref, title, selected }]. Leer, wenn keine Tab-Leiste gefunden wird. */
export async function tabsOf(app, wid) {
  if (!TAB_APPS.test(app)) return [];
  let tree;
  try {
    tree = (await ad(['snapshot', '--app', app, '--window-id', wid, '-i', '--max-depth', 10, '--timeout-ms', 15000], 40000)).tree;
  } catch {
    return [];
  }
  const tabs = [];
  (function walk(n, inList) {
    if (!n) return;
    const here = inList || n.role === 'tablist';
    if (here && (n.role === 'radiobutton' || n.role === 'tab') && n.ref_id && n.name) {
      const selected = String(n.value) === 'true' || (n.states || []).includes('selected') || (n.states || []).includes('checked');
      tabs.push({ ref: n.ref_id, title: cleanTabTitle(n.name), selected });
    }
    for (const c of n.children || []) walk(c, here);
  })(tree, false);
  return tabs;
}

/**
 * Holt einen Tab in den Vordergrund seines Fensters. Gibt den Titel des bisher vorderen Tabs zurück,
 * wenn gewechselt wurde (zum Wiederherstellen), sonst null.
 */
export async function selectTab(app, wid, title) {
  const tabs = await tabsOf(app, wid);
  const want = tabs.find((t) => t.title === title);
  if (!want) throw new AgentError(`Tab „${title}“ nicht gefunden (wurde er geschlossen?)`);
  if (want.selected) return null;
  const prev = tabs.find((t) => t.selected);
  await ad(['click', want.ref]);
  await sleep(600); // Seite braucht einen Moment, bis ihre Felder lesbar sind
  return prev ? prev.title : null;
}

async function windowsOf(app) {
  const wins = (await ad(['list-windows', '--app', app, '--timeout-ms', 10000], 30000)) || [];
  return wins.filter((w) => w.title && !w.minimized);
}

/**
 * Fenster einer App, bei Browsern jeder Tab einzeln. Gleiche Einträge werden zusammengefasst (das größte Fenster zählt).
 * Eintrag: { id, tab (Titel oder null), title, count }.
 */
export async function listWindows(app) {
  const byKey = new Map();
  const add = (e) => {
    const key = `${e.title}\u0000${e.tab || ''}`;
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { ...e, count: 1 });
    else {
      cur.count += 1;
      if (e.area > cur.area) Object.assign(cur, { id: e.id, area: e.area });
    }
  };
  for (const w of await windowsOf(app)) {
    const tabs = await tabsOf(app, w.id);
    if (tabs.length > 1) for (const t of tabs) add({ id: w.id, title: t.title, tab: t.title, area: area(w) });
    else add({ id: w.id, title: w.title, tab: null, area: area(w) });
  }
  return [...byKey.values()]
    .map(({ area: _a, ...rest }) => rest)
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
}

/** Prüft, dass ein Fenster zur gewählten App gehört. */
export async function assertWindow(app, id) {
  const wins = (await ad(['list-windows', '--app', app, '--timeout-ms', 10000], 30000)) || [];
  if (!wins.some((w) => w.id === id)) throw new AgentError(`Fenster ${id} gehört nicht zu ${app}`);
}

/**
 * Sucht das Fenster oder bei Browsern den Tab, dessen Titel `contains` enthält (ohne Groß-/Kleinschreibung).
 * Zuerst über die Fenstertitel (schnell), dann über alle Tabs. Mehrere verschiedene Titel gelten als mehrdeutig.
 * Ergebnis: { ok:true, id, title, tab } (tab = Titel oder null) oder { ok:false, reason }.
 */
export async function findWindow(app, contains) {
  const needle = contains.toLowerCase();
  const all = await windowsOf(app);
  const hits = all.filter((w) => w.title.toLowerCase().includes(needle));
  if (hits.length) {
    const titles = [...new Set(hits.map((w) => w.title))];
    if (titles.length > 1) return { ok: false, reason: `mehrdeutig: ${titles.length} Fenster passen zu „${contains}“` };
    const best = hits.reduce((a, b) => (area(b) > area(a) ? b : a));
    return { ok: true, id: best.id, title: best.title, tab: null };
  }
  const tabHits = [];
  const open = new Set(all.map((w) => w.title));
  for (const w of all) {
    for (const t of await tabsOf(app, w.id)) {
      open.add(t.title);
      if (t.title.toLowerCase().includes(needle)) tabHits.push({ id: w.id, title: t.title });
    }
  }
  const tabTitles = [...new Set(tabHits.map((t) => t.title))];
  if (tabTitles.length > 1) return { ok: false, reason: `mehrdeutig: ${tabTitles.length} Tabs passen zu „${contains}“` };
  if (tabHits.length) return { ok: true, id: tabHits[0].id, title: tabHits[0].title, tab: tabHits[0].title };
  const list = open.size
    ? ` Offen (Fenster und Tabs): ${[...open].slice(0, 8).map((t) => `„${t.length > 40 ? t.slice(0, 40) + '…' : t}“`).join(', ')}.`
    : ` ${app} hat keine offenen Fenster.`;
  return { ok: false, reason: `weder Fenster noch Tab in ${app}, dessen Titel „${contains}“ enthält.${list}` };
}
