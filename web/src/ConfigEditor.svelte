<script>
  // Konfiguration anlegen oder anpassen: Name und Hilfe, ein oder mehrere Schritte, Speichern.
  // Die Leiste unten bleibt beim Scrollen sichtbar und sagt, was noch fehlt.
  import { createEventDispatcher } from 'svelte';
  import StepEditor from './StepEditor.svelte';
  import { api } from './api.js';
  import { t } from './i18n.js';

  export let config = null; // null = neu
  export let agentOk = true;

  const dispatch = createEventDispatcher();
  const MAX_STEPS = 10;

  let name = config?.name || '';
  let help = config?.help || '';
  let nameTouched = !!config;
  let counter = 0;
  let steps = config ? config.steps.map((s) => ({ key: counter++, existing: s })) : [{ key: counter++, existing: null }];
  let states = {}; // Schlüssel eines Schritts → zuletzt gemeldeter Zustand
  let saving = false;
  let probing = false;
  let refs = {}; // Schlüssel eines Schritts → StepEditor (für den Probelauf)
  let error = '';

  const addStep = () => { steps = [...steps, { key: counter++, existing: null }]; };
  const removeStep = (k) => { steps = steps.filter((s) => s.key !== k); delete states[k]; states = states; };
  const setState = (k, d) => { states[k] = d; states = states; };

  // Vorbelegung für Schritt 2, 3 …: Programm und Fenster des vorigen Schritts
  const presetOf = (i, side) => (i > 0 ? states[steps[i - 1].key]?.step?.[side] || null : null);

  $: first = states[steps[0]?.key];
  $: if (!nameTouched && !name && first?.suggestedName) name = first.suggestedName;

  $: firstProblem = steps.map((s, i) => ({ i, m: states[s.key]?.missing ?? $t('ui.editor.loading') })).find((x) => x.m);
  $: allReady = steps.length > 0 && steps.every((s) => states[s.key] && states[s.key].ready && states[s.key].step);
  $: canSave = name.trim() !== '' && allReady && !saving;

  $: anyToProbe = steps.some((s) => states[s.key]?.canProbe);
  $: anyTesting = steps.some((s) => states[s.key]?.testing);

  // Probelauf aller Schritte, die noch nicht erfolgreich getestet sind, der Reihe nach. Stoppt beim ersten Fehler.
  async function probeAll() {
    error = ''; probing = true;
    for (const s of steps) {
      if (!states[s.key]?.canProbe) continue;
      const ok = await refs[s.key].runProbe();
      if (!ok) break;
    }
    probing = false;
  }

  async function save() {
    error = ''; saving = true;
    try {
      const body = {
        name: name.trim(),
        help,
        steps: steps.map((s) => {
          const st = states[s.key];
          return { title: st.title, after: st.after, ...st.step };
        }),
      };
      const saved = config ? await api('PUT', `/api/configs/${config.id}`, body) : await api('POST', '/api/configs', body);
      dispatch('saved', { id: saved.id });
    } catch (e) { error = e.message; }
    saving = false;
  }
</script>

<div class="stack">
  <section class="card">
    <h2>{config ? $t('ui.editor.titleEdit') : $t('ui.editor.titleNew')}</h2>
    <label class="field">
      {$t('ui.editor.name')}
      <input bind:value={name} on:input={() => (nameTouched = true)} placeholder={$t('ui.editor.namePlaceholder')} />
    </label>
    <label class="field">
      {$t('ui.editor.help')}
      <textarea bind:value={help} rows="3" placeholder={$t('ui.editor.helpPlaceholder')}></textarea>
      <span class="muted small">{$t('ui.editor.helpHint')}</span>
    </label>
  </section>

  {#each steps as s, i (s.key)}
    <StepEditor
      bind:this={refs[s.key]}
      index={i}
      existing={s.existing}
      hasNext={i < steps.length - 1}
      removable={steps.length > 1}
      {agentOk}
      presetSource={presetOf(i, 'source')}
      presetTarget={presetOf(i, 'target')}
      on:update={(e) => setState(s.key, e.detail)}
      on:remove={() => removeStep(s.key)}
    />
  {/each}

  <section class="card add">
    <div>
      <strong>{$t('ui.editor.moreTitle')}</strong>
      <p class="muted small">{$t('ui.editor.moreText')}</p>
    </div>
    <button on:click={addStep} disabled={steps.length >= MAX_STEPS}>{$t('ui.editor.addStep')}</button>
  </section>

  {#if error}<p class="bad" role="alert">{error}</p>{/if}

  <div class="bar">
    <button class:primary={!allReady} disabled={!anyToProbe || probing || anyTesting || !agentOk} on:click={probeAll}
      title={$t('ui.editor.probeTitle')}>
      {probing ? $t('ui.editor.probing') : steps.filter((s) => states[s.key]?.canProbe).length > 1 ? $t('ui.editor.probeAll') : $t('ui.editor.probeStart')}
    </button>
    <button class:primary={allReady} disabled={!canSave} on:click={save}>{$t('ui.editor.save')}</button>
    <button on:click={() => dispatch('cancel')}>{$t('ui.cancel')}</button>
    <span class="status small">
      {#if !name.trim()}
        <span class="muted">{$t('ui.editor.needName')}</span>
      {:else if firstProblem}
        <span class="muted">{steps.length > 1 ? `${$t('ui.detail.stepN', { n: firstProblem.i + 1 })}: ` : ''}{firstProblem.m}</span>
      {:else}
        <span class="ok">{$t('ui.editor.allTested')}</span>
      {/if}
    </span>
  </div>
</div>

<style>
  .stack { display: grid; gap: 1.25rem; }
  .add { display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .add p { margin: 0.25rem 0 0; max-width: 46rem; }
  .bar {
    position: sticky; bottom: 0; z-index: 5;
    display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;
    padding: 0.75rem 0; background: var(--bg); border-top: 1px solid var(--line);
  }
  .status { flex: 1; min-width: 14rem; }
</style>
