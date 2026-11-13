<script>
  // Programm → Fenster oder Tab → „Titel enthält“. Meldet die Auswahl nach oben (change) und was noch fehlt (hint).
  // Gelesen werden die Felder erst, wenn Quelle und Ziel gewählt sind (Knopf „Felder laden“ im Schritt).
  import { createEventDispatcher } from 'svelte';
  import { api } from './api.js';

  export let title = 'Quelle';
  export let side = 'source'; // nur für Beschriftungen
  export let agentOk = true;
  export let preset = null; // { app, windowContains } aus dem vorigen Schritt: Programm und Fenster vorwählen

  const dispatch = createEventDispatcher();

  let apps = [];
  let app = '';
  let windows = [];
  let entryKey = ''; // Auswahl: Fenster oder Tab (Schlüssel aus id und Tab)
  let contains = ''; // „Titel enthält“ – wird zum Wiederfinden gespeichert
  let busy = '';
  let error = '';

  async function run(label, fn) {
    error = '';
    busy = label;
    try { await fn(); } catch (e) { error = e.message; }
    busy = '';
  }

  const loadApps = () =>
    run('Lade Programme …', async () => {
      apps = (await api('GET', '/api/apps')).apps;
      if (preset && !app && apps.includes(preset.app)) {
        app = preset.app;
        await loadWindows(true);
      }
    });

  async function loadWindows(usePreset = false) {
    windows = (await api('GET', `/api/windows?app=${encodeURIComponent(app)}`)).windows.map((w) => ({ ...w, key: `${w.id}\u0000${w.tab || ''}` }));
    const frag = usePreset && preset ? preset.windowContains.toLowerCase() : '';
    const match = frag ? windows.filter((w) => w.title.toLowerCase().includes(frag)) : [];
    if (match.length === 1) {
      entryKey = match[0].key;
      chooseWindow();
      contains = preset.windowContains; // gespeicherten Teil des Titels beibehalten
    } else if (windows.length === 1) {
      entryKey = windows[0].key;
      chooseWindow();
    }
  }

  function chooseApp() {
    windows = []; entryKey = ''; contains = '';
    if (!app) return;
    run('Lade Fenster …', () => loadWindows(false));
  }

  function chooseWindow() {
    const w = windows.find((x) => x.key === entryKey);
    contains = w ? w.title : '';
  }

  // Programme laden, sobald agent-desktop bereit ist (auch wenn der Status erst nach dem Öffnen eintrifft)
  let triedApps = false;
  $: if (agentOk && !triedApps) { triedApps = true; loadApps(); }

  $: chosen = windows.find((x) => x.key === entryKey) || null;
  $: containsOk = !!chosen && contains.trim() !== '' && chosen.title.toLowerCase().includes(contains.trim().toLowerCase());
  $: selection = chosen && containsOk ? { app, windowId: chosen.id, tab: chosen.tab, title: chosen.title, windowContains: contains.trim() } : null;
  $: sig = selection ? JSON.stringify(selection) : '';
  let lastSig = null;
  $: if (sig !== lastSig) { lastSig = sig; dispatch('change', selection); }

  $: hint = !app ? 'Programm wählen'
    : !entryKey ? 'Fenster wählen'
    : !containsOk ? 'Titel prüfen (er passt nicht zum gewählten Fenster)'
    : '';
  $: dispatch('hint', hint);
</script>

<section class="card">
  <h2>{title}</h2>

  {#if !agentOk}<p class="bad">agent-desktop ist nicht bereit (siehe Hinweis oben).</p>{/if}

  <label class="field">
    Programm
    <select bind:value={app} on:change={chooseApp} disabled={!agentOk || !apps.length}>
      <option value="">– wählen –</option>
      {#each apps as a}<option value={a}>{a}</option>{/each}
    </select>
  </label>

  {#if app}
    <label class="field">
      Fenster oder Tab
      <select bind:value={entryKey} on:change={chooseWindow} disabled={!windows.length}>
        <option value="">– wählen –</option>
        {#each windows as w}<option value={w.key}>{w.tab ? '▭ Tab: ' : ''}{w.title}{w.count > 1 ? ` (×${w.count})` : ''}</option>{/each}
      </select>
      <span class="muted small hint">
        Bei Browsern erscheint jeder Tab einzeln. Zum Lesen und Schreiben holt der EasyCopy einen Hintergrund-Tab kurz nach vorn und stellt danach den vorherigen Tab wieder her.
      </span>
    </label>
  {/if}

  {#if entryKey}
    <label class="field">
      Titel enthält
      <input bind:value={contains} />
      <span class="muted small hint">
        Damit wird {side === 'target' ? 'das Ziel' : 'die Quelle'} später wiedergefunden. Nimm nur den Teil, der immer gleich bleibt, zum Beispiel „Posteingang“ statt „Posteingang (3) – Name“.
      </span>
    </label>
    {#if !containsOk}<p class="bad small">Der Text passt nicht zum gewählten Titel „{chosen?.title}“.</p>{/if}
  {/if}

  {#if busy}<p class="muted small" role="status">{busy}</p>{/if}
  {#if error}<p class="bad" role="alert">{error}</p>{/if}
</section>

<style>
  .hint { display: block; margin-top: 0.25rem; font-weight: 400; }
</style>
