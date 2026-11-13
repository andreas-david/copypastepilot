// Prüfen und Ausführen eines Schritts einer gespeicherten Konfiguration.
import { findWindow } from './windows.js';
import { checkPairs, copyFields } from './fields.js';

/** Nur lesen. Ergebnis: { ready, items:[{ok,label,detail}] }. `step` ist ein Schritt der Konfiguration. */
export async function checkStep(step, { passive = false } = {}) {
  const items = [];
  const found = {};
  for (const side of ['source', 'target']) {
    const name = side === 'source' ? 'Quelle' : 'Ziel';
    try {
      const w = await findWindow(step[side].app, step[side].windowContains);
      if (w.ok) {
        found[side] = { app: step[side].app, id: w.id, tab: w.tab };
        items.push({ ok: true, label: `${name} gefunden`, detail: `${step[side].app} – ${w.title}${w.tab ? ' (Tab)' : ''}` });
      } else {
        items.push({ ok: false, label: `${name} nicht gefunden`, detail: w.reason });
      }
    } catch (e) {
      items.push({ ok: false, label: `${name} nicht prüfbar`, detail: e.message });
    }
  }
  if (found.source && found.target) {
    try {
      const r = await checkPairs(found.source, found.target, step.pairs, { passive });
      const okCount = r.total - new Set(r.problems).size;
      items.push(
        r.skipped
          ? { ok: true, label: `${r.total} Felder: Prüfung erst beim Ausführen`, detail: 'Die Seite liegt in einem Hintergrund-Tab; er wird nicht ständig umgeschaltet.' }
          : r.problems.length
          ? { ok: false, label: `Felder: ${Math.max(okCount, 0)} von ${r.total} vorhanden`, detail: r.problems.join('; ') }
          : { ok: true, label: `${r.total} von ${r.total} Feldern vorhanden`, detail: '' },
      );
    } catch (e) {
      items.push({ ok: false, label: 'Felder nicht prüfbar', detail: e.message });
    }
  }
  return { ready: items.length === 3 && items.every((i) => i.ok), items };
}

/** Schreibt wirklich. Ergebnis: { ok, pairs:[{ok,detail}] } oder wirft Error mit verständlicher Meldung. */
export async function runStep(step) {
  const src = await findWindow(step.source.app, step.source.windowContains);
  if (!src.ok) throw new Error(`Quelle: ${src.reason}`);
  const dst = await findWindow(step.target.app, step.target.windowContains);
  if (!dst.ok) throw new Error(`Ziel: ${dst.reason}`);
  return copyFields({ app: step.source.app, id: src.id, tab: src.tab }, { app: step.target.app, id: dst.id, tab: dst.tab }, step.pairs);
}
