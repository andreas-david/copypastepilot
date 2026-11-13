<script>
  // Ein Schritt einer Konfiguration: Quelle (links) und Ziel (rechts) wählen, „Felder laden“, zuordnen, Probelauf.
  // Meldet seinen Zustand nach oben (update), damit der Editor entscheidet, ob gespeichert werden kann.
  import { createEventDispatcher } from 'svelte';
  import FieldPicker from './FieldPicker.svelte';
  import { api } from './api.js';

  export let index = 0;
  export let hasNext = false; // folgt nach diesem Schritt noch einer?
  export let existing = null; // gespeicherter Schritt (beim Bearbeiten) oder null
  export let agentOk = true;
  export let presetSource = null;
  export let presetTarget = null;
  export let removable = false;

  const dispatch = createEventDispatcher();

  let title = existing?.title || '';
  let after = existing?.after || '';
  let redo = !existing; // bei gespeicherten Schritten: Ziel, Quelle und Zuordnung nur auf Wunsch neu festlegen
  let sourceSel = null; // gewählt: { app, windowId, tab, title, windowContains }
  let targetSel = null;
  let source = null; // geladen: Auswahl + items (nur gültig, solange sie zur Auswahl passt)
  let target = null;
  let loading = false;
  let loadError = '';
  let mapping = {}; // Quellfeld-Schlüssel → Zielfeld-Schlüssel
  let testing = false;
  let result = null;
  let testedSignature = '';
  let error = '';
  let srcHint = 'Programm wählen';
  let tgtHint = 'Programm wählen';
  let showTexts = true;
  let onlyMapped = false;
  let query = '';

  const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  const selectionOf = (loaded) => {
    if (!loaded) return null;
    const { app, windowId, tab, title, windowContains } = loaded;
    return { app, windowId, tab, title, windowContains };
  };
  // Ändert sich die Auswahl nach dem Laden, sind die gelesenen Felder und die Zuordnung hinfällig.
  $: if (source && !same(selectionOf(source), sourceSel)) { source = null; result = null; mapping = {}; }
  $: if (target && !same(selectionOf(target), targetSel)) { target = null; result = null; mapping = {}; }
  $: loaded = !!source && !!target;

  async function loadFields() {
    loadError = ''; loading = true; result = null;
    try {
      const t = await api('POST', '/api/scan', { app: targetSel.app, windowId: targetSel.windowId, tab: targetSel.tab, includeEmpty: true });
      const s = await api('POST', '/api/scan', { app: sourceSel.app, windowId: sourceSel.windowId, tab: sourceSel.tab, includeEmpty: false });
      mapping = {};
      target = { ...targetSel, items: t.items.filter((i) => i.kind === 'input' && !i.secure) };
      source = { ...sourceSel, items: s.items };
    } catch (e) { loadError = e.message; }
    loading = false;
  }

  const key = (f) => `${f.role}|${f.label}|${f.occurrence}`;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const short = (v, n = 40) => ((v || '').length > n ? `${v.slice(0, n)}…` : v || '');
  const label = (f) =>
    f.role === 'statictext'
      ? `Text „${short(f.value)}“`
      : `${f.label || '(ohne Beschriftung)'}${f.occurrence > 0 ? ` #${f.occurrence + 1}` : ''}`;

  // Vorschlag nach Beschriftung: erst gleich, dann enthält/ist enthalten (mind. 3 Zeichen). Der Nutzer korrigiert.
  function suggest(sf, targets, used) {
    const a = norm(sf.label);
    if (!a) return '';
    const free = targets.filter((t) => !used.has(key(t)));
    const exact = free.find((t) => norm(t.label) === a);
    if (exact) return key(exact);
    const part = free.find((t) => { const b = norm(t.label); return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a)); });
    return part ? key(part) : '';
  }

  function syncMapping(rows, targets) {
    const next = {};
    const used = new Set();
    for (const sf of rows) {
      const old = mapping[key(sf)];
      if (old && targets.some((t) => key(t) === old) && !used.has(old)) { next[key(sf)] = old; used.add(old); }
    }
    for (const sf of rows) {
      if (next[key(sf)] === undefined) {
        const s = sf.kind === 'input' ? suggest(sf, targets, used) : '';
        next[key(sf)] = s;
        if (s) used.add(s);
      }
    }
    mapping = next;
  }

  $: sourceRows = source ? source.items : [];
  $: targetFields = target ? target.items : [];
  $: if (redo && source && target) syncMapping(sourceRows, targetFields);
  $: usedTargets = new Set(Object.values(mapping).filter(Boolean));

  $: q = query.trim().toLowerCase();
  $: shownRows = sourceRows
    .filter((r) => r.kind === 'input' || showTexts)
    .filter((r) => !onlyMapped || mapping[key(r)])
    .filter((r) => !q || `${r.kind === 'input' ? r.label : ''} ${r.value}`.toLowerCase().includes(q));

  $: pairs = redo && source && target
    ? sourceRows.filter((f) => mapping[key(f)] && targetFields.some((x) => key(x) === mapping[key(f)])).map((f) => {
        const t = targetFields.find((x) => key(x) === mapping[key(f)]);
        return { src: { role: f.role, label: f.label, occurrence: f.occurrence }, dst: { role: t.role, label: t.label, occurrence: t.occurrence } };
      })
    : [];

  const sameField = (a, b) => a.role === b.role && a.label === b.label && a.occurrence === b.occurrence;
  const pairIndex = (f) => pairs.findIndex((p) => sameField(p.src, f));
  const assignedTo = (t) => sourceRows.find((f) => mapping[key(f)] === key(t));

  $: probe = redo && source && target && pairs.length
    ? {
        source: { app: source.app, windowId: source.windowId, tab: source.tab, windowContains: source.windowContains },
        target: { app: target.app, windowId: target.windowId, tab: target.tab, windowContains: target.windowContains },
        pairs,
      }
    : null;
  $: signature = probe ? JSON.stringify(probe) : '';
  $: tested = !!result && result.ok && testedSignature === signature;
  $: stale = !!result && testedSignature !== signature;
  $: openTargets = targetFields.filter((t) => !assignedTo(t)).length;

  // Wird vom Probelauf-Knopf in der Leiste des Editors aufgerufen. Gibt zurück, ob alles kopiert wurde.
  export async function runProbe() {
    error = ''; testing = true; result = null;
    let ok = false;
    try {
      const r = await api('POST', '/api/probe', probe);
      testedSignature = signature;
      result = r;
      ok = !!r.ok;
    } catch (e) { error = e.message; }
    testing = false;
    return ok;
  }

  // Was fehlt diesem Schritt noch? (für die Leiste im Editor)
  $: missing = !redo ? ''
    : !sourceSel ? `Quelle: ${srcHint || 'wählen'}`
    : !targetSel ? `Ziel: ${tgtHint || 'wählen'}`
    : !loaded ? '„Felder laden“ klicken'
    : !pairs.length ? 'mindestens ein Quellfeld einem Zielfeld zuordnen'
    : stale ? 'Zuordnung geändert – bitte neu testen'
    : !tested ? (result && !result.ok ? 'Probelauf hat nicht alles kopiert' : 'Probelauf starten') : '';

  $: dispatch('update', {
    title,
    after,
    ready: !missing,
    missing,
    canProbe: !!probe && !tested && !testing,
    testing,
    suggestedName: sourceSel && targetSel ? `${sourceSel.title} → ${targetSel.title}` : '',
    step: !redo
      ? { source: existing.source, target: existing.target, pairs: existing.pairs }
      : probe
        ? { source: { app: source.app, windowContains: source.windowContains }, target: { app: target.app, windowContains: target.windowContains }, pairs }
        : null,
  });
</script>

<section class="step">
  <header>
    <h2><span class="chip">Schritt {index + 1}</span></h2>
    <input class="title" bind:value={title} placeholder="Bezeichnung (optional), z. B. Seite 1: Kundendaten" aria-label="Bezeichnung des Schritts" />
    {#if removable}<button class="danger" on:click={() => dispatch('remove')}>Schritt entfernen</button>{/if}
  </header>

  {#if hasNext}
    <label class="field">
      Hinweis nach diesem Schritt
      <input bind:value={after} placeholder="z. B. Prüfe die Angaben und klicke im Formular auf „Weiter“." />
      <span class="muted small">Wird beim Ausführen angezeigt, bevor der nächste Schritt startet.</span>
    </label>
  {/if}

  {#if !redo}
    <section class="card">
      <h3>Zuordnung</h3>
      <p>{existing.source.app} „{existing.source.windowContains}“ → {existing.target.app} „{existing.target.windowContains}“, {existing.pairs.length} Felder.</p>
      <button on:click={() => (redo = true)}>Ziel, Quelle und Zuordnung neu festlegen</button>
    </section>
  {:else}
    <div class="cols">
      <FieldPicker title="Quelle – von hier kopieren" side="source" {agentOk} preset={presetSource} on:change={(e) => (sourceSel = e.detail)} on:hint={(e) => (srcHint = e.detail)} />
      <FieldPicker title="Ziel – hier hinein" side="target" {agentOk} preset={presetTarget} on:change={(e) => (targetSel = e.detail)} on:hint={(e) => (tgtHint = e.detail)} />
    </div>

    <div class="loadbar">
      <button class="primary" on:click={loadFields} disabled={!sourceSel || !targetSel || loading || !agentOk}>
        {loading ? 'Lese Felder … (bei großen Seiten einige Sekunden)' : loaded ? 'Felder neu laden' : 'Felder laden'}
      </button>
      <span class="muted small">
        {#if !sourceSel || !targetSel}Wähle zuerst Quelle und Ziel.{:else if !loaded}Liest die Felder aus beiden Fenstern. Es wird nichts verändert.{:else}Gelesen. Unten kannst du zuordnen.{/if}
      </span>
    </div>
    {#if loadError}<p class="bad" role="alert">{loadError}</p>{/if}

    {#if loaded}
      <div class="cols map">
        <section class="card">
          <h3>Zuordnung</h3>
          <p class="muted small">
            Wähle bei jedem Quellfeld, in welches Zielfeld es kopiert werden soll. Vorschläge kommen aus den Beschriftungen – bitte prüfen.
          </p>
          <p class="probe small" role="status">
            {#if testing}<span class="muted">Probelauf läuft …</span>
            {:else if tested}<span class="ok">Probelauf: alle {result.pairs.length} Felder kopiert und zurückgelesen.</span>
            {:else if result && !stale && !result.ok}<span class="bad">Nicht alles hat geklappt (siehe Zeilen unten).</span>
            {:else if stale}<span class="muted">Zuordnung geändert – bitte unten neu testen.</span>
            {:else}<span class="muted">{pairs.length} Felder zugeordnet. Den Probelauf startest du unten neben „Speichern“. Er schreibt wirklich ins Zielfenster – am besten eine Testseite ohne echte Daten.</span>{/if}
          </p>
          {#if error}<p class="bad" role="alert">{error}</p>{/if}
          <div class="filters">
            <input class="search" type="search" placeholder="Suchen …" bind:value={query} aria-label="Felder durchsuchen" />
            <label class="inline"><input type="checkbox" bind:checked={showTexts} /> normaler Text</label>
            <label class="inline"><input type="checkbox" bind:checked={onlyMapped} /> nur zugeordnete</label>
          </div>
          <div class="scroll">
            <table>
              <thead><tr><th>Quelle</th><th>Inhalt</th><th>→ Zielfeld</th></tr></thead>
              <tbody>
                {#each shownRows as f (key(f))}
                  {@const k = key(f)}
                  {@const idx = pairIndex(f)}
                  <tr class:mapped={!!mapping[k]}>
                    <td>{#if f.kind === 'text'}<span class="tag">Text</span>{:else}{label(f)}{/if}</td>
                    <td class="value">{f.secure ? f.value : short(f.value, 80)}</td>
                    <td>
                      {#if f.secure}
                        <span class="muted small">wird nie gelesen</span>
                      {:else}
                        <select bind:value={mapping[k]} aria-label={`Zielfeld für ${label(f)}`}>
                          <option value="">– nicht kopieren –</option>
                          {#each targetFields as t}
                            <option value={key(t)} disabled={usedTargets.has(key(t)) && mapping[k] !== key(t)}>{label(t)}</option>
                          {/each}
                        </select>
                        {#if result && !stale && idx >= 0}
                          <div class={result.pairs[idx].ok ? 'ok small' : 'bad small'}>{result.pairs[idx].ok ? '✓' : '✗'} {result.pairs[idx].detail}</div>
                        {/if}
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <h3>Zielfelder</h3>
          <p class="muted small">{openTargets ? `${openTargets} noch ohne Quelle.` : 'Alle haben eine Quelle.'}</p>
          <ul class="targets">
            {#each targetFields as t (key(t))}
              {@const a = assignedTo(t)}
              <li class:open={!a}>
                <div class="tname">{label(t)}</div>
                <div class="tnow muted small">{t.value ? `jetzt: ${short(t.value, 30)}` : 'leer'}</div>
                <div class="tsrc">{#if a}<span class="ok">←</span> {label(a)}{:else}<span class="muted">– offen –</span>{/if}</div>
              </li>
            {/each}
          </ul>
        </section>
      </div>
    {/if}
  
{/if}
</section>

<style>
  .step { border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem; display: grid; gap: 1rem; background: color-mix(in srgb, var(--panel) 40%, transparent); }
  header { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  header h2 { margin: 0; }
  .chip { display: inline-block; padding: 0.15rem 0.7rem; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-size: 0.95rem; }
  .title { flex: 1; min-width: 12rem; width: auto; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; align-items: start; }
  .cols.map { grid-template-columns: minmax(360px, 1.6fr) minmax(240px, 1fr); }
  .loadbar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  @media (max-width: 1000px) { .cols, .cols.map { grid-template-columns: 1fr; } }
  h3 { margin-bottom: 0.25rem; }
  .targets { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
  .targets li { display: grid; gap: 0.1rem; padding: 0.5rem 0.65rem; border: 1px solid var(--line); border-radius: var(--radius); }
  .targets li.open { border-style: dashed; }
  .tname { font-weight: 600; }
  .probe { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
  .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin: 0.5rem 0; }
  .search { flex: 1; min-width: 9rem; width: auto; }
  label.inline { display: inline-flex; gap: 0.4rem; align-items: center; }
  input[type='checkbox'] { width: auto; }
  .scroll { max-height: 26rem; overflow: auto; }
  tr.mapped { background: var(--sel); }
  .tag { font-size: 0.75rem; padding: 0.05rem 0.4rem; border-radius: 4px; background: var(--sel); border: 1px solid var(--line); }
  td select { min-width: 10rem; }
</style>
