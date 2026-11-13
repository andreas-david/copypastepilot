<script>
  // Eine Konfiguration: Schritt für Schritt prüfen und ausführen. Nach jedem Schritt sieht der Mensch das Ziel,
  // klickt dort auf „Weiter“ und startet erst dann den nächsten Schritt hier im Tool.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { api, ago } from './api.js';

  export let config;

  const dispatch = createEventDispatcher();
  const DEFAULT_AFTER = 'Prüfe die Angaben im Zielfenster und klicke dort auf „Weiter“ (oder öffne die nächste Seite). Starte danach hier den nächsten Schritt.';

  let stepIdx = 0;
  let check = null; // { ready, items }
  let checking = false;
  let running = false;
  let result = null; // Ergebnis des zuletzt ausgeführten Schritts in dieser Ansicht
  let timer = null;
  let currentId = null;
  let confirmDelete = false;

  $: steps = config.steps;
  $: multi = steps.length > 1;
  $: step = steps[Math.min(stepIdx, steps.length - 1)];
  $: isLast = stepIdx >= steps.length - 1;
  $: stepLabel = multi ? `Schritt ${stepIdx + 1} von ${steps.length}${step.title ? `: ${step.title}` : ''}` : '';

  async function runCheck() {
    if (checking || running) return;
    const id = config.id;
    const idx = stepIdx;
    checking = true;
    try {
      const r = await api('POST', `/api/configs/${id}/check`, { step: idx });
      if (id === config.id && idx === stepIdx) check = r;
    } catch (e) {
      if (id === config.id && idx === stepIdx) check = { ready: false, items: [{ ok: false, label: 'Prüfung fehlgeschlagen', detail: e.message }] };
    }
    checking = false;
  }

  function restart() {
    check = null;
    clearInterval(timer);
    runCheck();
    // alle 5 Sekunden, solange die Seite sichtbar ist und der Schritt noch nicht erledigt wurde
    timer = setInterval(() => { if (!document.hidden && !result?.ok) runCheck(); }, 5000);
  }

  // Beim Wechsel der Konfiguration von vorn beginnen
  $: if (config.id !== currentId) {
    currentId = config.id;
    stepIdx = 0;
    result = null;
    confirmDelete = false;
    restart();
  }

  async function execute() {
    running = true;
    result = null;
    try {
      result = await api('POST', `/api/configs/${config.id}/run`, { step: stepIdx });
    } catch (e) {
      result = { ok: false, pairs: [], error: e.message };
    }
    running = false;
    dispatch('ran');
  }

  function goTo(i) {
    stepIdx = i;
    result = null;
    restart();
  }

  async function remove() {
    try {
      await api('DELETE', `/api/configs/${config.id}`);
      dispatch('removed');
    } catch (e) {
      result = { ok: false, pairs: [], error: e.message };
    }
  }

  // Gespeichert werden nie Inhalte. Ein Text wird daher nach seiner Lage beschrieben.
  const fieldName = (f) =>
    f.role === 'statictext' ? `Text Nr. ${f.occurrence + 1}${f.label ? ` in „${f.label}“` : ''}` : `${f.label || '(ohne Beschriftung)'}${f.occurrence > 0 ? ` #${f.occurrence + 1}` : ''}`;

  $: okCount = result ? result.pairs.filter((p) => p.ok).length : 0;
  onDestroy(() => clearInterval(timer));
</script>

<article class="card">
  <header>
    <div>
      <h2>{config.name}</h2>
      <p class="muted small">
        {steps[0].source.app} „{steps[0].source.windowContains}“ → {steps[0].target.app} „{steps[0].target.windowContains}“{multi ? ` · ${steps.length} Schritte` : ''}
      </p>
    </div>
    <div class="actions">
      <button on:click={() => dispatch('edit')}>Bearbeiten</button>
      {#if confirmDelete}
        <button class="danger" on:click={remove}>Wirklich löschen</button>
        <button on:click={() => (confirmDelete = false)}>Abbrechen</button>
      {:else}
        <button class="danger" on:click={() => (confirmDelete = true)}>Löschen</button>
      {/if}
    </div>
  </header>

  <section>
    <h3>So bereitest du es vor</h3>
    {#if config.help}
      <p class="help">{config.help}</p>
    {:else}
      <p class="muted">Noch kein Hilfetext. Unter „Bearbeiten“ kannst du aufschreiben, welche Seiten vorher geöffnet sein müssen.</p>
    {/if}
  </section>

  {#if multi}
    <ol class="stepper" aria-label="Schritte">
      {#each steps as s, i}
        <li class:current={i === stepIdx} class:done={i < stepIdx || (i === stepIdx && result?.ok)}>
          <span class="n">{i < stepIdx || (i === stepIdx && result?.ok) ? '✓' : i + 1}</span>
          <span>{s.title || `Seite ${i + 1}`}</span>
        </li>
      {/each}
    </ol>
  {/if}

  <section>
    <h3>Ist alles bereit?{multi ? ` – ${stepLabel}` : ''}</h3>
    {#if !check}
      <p class="muted" role="status">Prüfe …</p>
    {:else}
      <ul class="checks" aria-live="polite">
        {#each check.items as i}
          <li>
            <span class={i.ok ? 'ok' : 'bad'} aria-hidden="true">{i.ok ? '✓' : '✗'}</span>
            <span><strong>{i.label}</strong>{#if i.detail}<span class="muted">&nbsp;– {i.detail}</span>{/if}</span>
          </li>
        {/each}
      </ul>
      {#if !check.ready && !result?.ok}
        <p class="muted small">
          Sobald die Fenster geöffnet sind, erkennt die Seite es automatisch. Bei Browsern zählt der vordere Tab: Die Seite
          muss in einem eigenen Fenster liegen oder dort gerade angezeigt werden.{#if multi && stepIdx > 0} Bei Folgeschritten: Ist im Zielfenster schon die nächste Seite offen („Weiter“ geklickt)?{/if}
        </p>
      {/if}
    {/if}
  </section>

  <section class="run">
    <button class="primary big" disabled={!check?.ready || running || result?.ok} on:click={execute}>
      {running ? 'Läuft …' : multi ? `Schritt ${stepIdx + 1} ausführen` : 'Ausführen'}
    </button>
    {#if running}<p class="muted small" role="status">Die beiden Fenster kommen dabei kurz nach vorn, danach geht es hier weiter.</p>{/if}
  </section>

  {#if result}
    <section aria-live="polite">
      {#if result.error}
        <p class="bad"><strong>Nicht ausgeführt:</strong> {result.error}</p>
      {:else}
        <h3 class={result.ok ? 'ok' : 'bad'}>
          {result.ok ? `Fertig: ${okCount} von ${result.pairs.length} Feldern kopiert` : `Nicht alles hat geklappt: ${okCount} von ${result.pairs.length} Feldern kopiert`}
        </h3>
        <table>
          <tbody>
            {#each result.pairs as p, n}
              <tr>
                <td>{fieldName(step.pairs[n].src)} → {fieldName(step.pairs[n].dst)}</td>
                <td class={p.ok ? 'ok' : 'bad'}>{p.ok ? '✓' : '✗'} {p.detail}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      {#if result.ok && multi && !isLast}
        <div class="next">
          <p><strong>Als Nächstes:</strong> {step.after || DEFAULT_AFTER}</p>
          <button class="primary" on:click={() => goTo(stepIdx + 1)}>Weiter zu Schritt {stepIdx + 2} →</button>
          <button on:click={() => goTo(stepIdx)}>Diesen Schritt wiederholen</button>
        </div>
      {:else if result.ok && multi && isLast}
        <div class="next">
          <p class="ok"><strong>Alle {steps.length} Schritte erledigt.</strong></p>
          <button on:click={() => goTo(0)}>Von vorn beginnen</button>
        </div>
      {:else if result.ok}
        <p><button on:click={() => goTo(stepIdx)}>Noch einmal ausführen</button></p>
      {/if}
    </section>
  {:else if config.lastRun}
    <p class="muted small">
      Zuletzt ausgeführt {ago(config.lastRun.at)}{config.lastRun.steps > 1 ? ` (Schritt ${config.lastRun.step + 1} von ${config.lastRun.steps})` : ''}:
      <span class={config.lastRun.ok ? 'ok' : 'bad'}>{config.lastRun.ok ? 'erfolgreich' : 'mit Fehlern'}</span>.
    </p>
  {/if}

  <details>
    <summary>Zuordnung anzeigen</summary>
    {#each steps as s, i}
      {#if multi}<h3 class="sh">Schritt {i + 1}{s.title ? `: ${s.title}` : ''} <span class="muted small">{s.target.app} „{s.target.windowContains}“</span></h3>{/if}
      <table>
        <thead><tr><th>Quellfeld</th><th>Zielfeld</th></tr></thead>
        <tbody>
          {#each s.pairs as p}
            <tr><td>{fieldName(p.src)}</td><td>{fieldName(p.dst)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/each}
  </details>
</article>

<style>
  header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: flex-start; }
  section { margin: 1.25rem 0; }
  .help { white-space: pre-wrap; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.75rem 0.9rem; }
  .checks { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .checks li { display: grid; grid-template-columns: 1.4rem 1fr; }
  .run { margin: 1.5rem 0; }
  .stepper { list-style: none; display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0; margin: 1rem 0; }
  .stepper li { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.25rem 0.75rem 0.25rem 0.3rem; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); }
  .stepper li.current { border-color: var(--accent); color: var(--text); background: var(--sel); }
  .stepper li.done { color: var(--ok); }
  .stepper .n { display: inline-grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--line); color: var(--text); font-size: 0.8rem; }
  .stepper li.current .n { background: var(--accent); color: var(--accent-text); }
  .stepper li.done .n { background: var(--ok); color: var(--panel); }
  .next { margin-top: 1rem; padding: 0.9rem 1rem; border: 1px solid var(--info-line); background: var(--info-bg); border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
  .next p { flex-basis: 100%; margin: 0; }
  .sh { margin: 1rem 0 0.25rem; }
  details { margin-top: 1.5rem; }
  summary { cursor: pointer; color: var(--muted); }
</style>
