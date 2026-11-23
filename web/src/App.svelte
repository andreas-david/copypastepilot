<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, hasToken, ago } from './api.js';
  import { getTheme, setTheme } from './theme.js';
  import { t, lang, setLang, LANGS } from './i18n.js';
  import ConfigDetail from './ConfigDetail.svelte';
  import ConfigEditor from './ConfigEditor.svelte';

  let status = null;
  let configs = [];
  let selectedId = null;
  let mode = 'view'; // 'view' | 'edit' | 'new'
  let error = '';
  let timer = null;
  let dismissed = '';
  let theme = getTheme();
  const themes = ['auto', 'light', 'dark'];
  const langNames = { de: 'Deutsch', en: 'English' };
  const chooseTheme = (t) => { theme = t; setTheme(t); };

  try { dismissed = localStorage.getItem('ec-dismissed-update') || ''; } catch { /* egal */ }

  $: selected = configs.find((c) => c.id === selectedId) || null;
  $: update = status?.update;
  $: showUpdate = update?.available && dismissed !== update.latest;

  async function loadStatus() {
    try { status = await api('GET', '/api/status'); } catch (e) { error = e.message; }
  }

  async function loadConfigs() {
    try { configs = (await api('GET', '/api/configs')).configs; } catch (e) { error = e.message; }
  }

  function dismissUpdate() {
    dismissed = update.latest;
    try { localStorage.setItem('ec-dismissed-update', dismissed); } catch { /* egal */ }
  }

  function pick(id) {
    selectedId = id;
    mode = 'view';
  }

  async function saved(e) {
    await loadConfigs();
    pick(e.detail.id);
  }

  async function removed() {
    selectedId = null;
    mode = 'view';
    await loadConfigs();
  }

  onMount(async () => {
    if (!hasToken) return;
    await Promise.all([loadStatus(), loadConfigs()]);
    if (configs.length && !selectedId) selectedId = configs[0].id;
    timer = setInterval(loadStatus, status?.agent === 'ok' ? 60000 : 5000);
  });
  onDestroy(() => clearInterval(timer));
</script>

{#if !hasToken}
  <main class="narrow">
    <div class="card">
      <h1>{$t('ui.token.title')}</h1>
      <p>{$t('ui.token.text')}</p>
    </div>
  </main>
{:else}
  <div class="shell">
    <header>
      <h1>CopyPastePilot</h1>
      {#if status}<span class="muted small">{$t('ui.version', { version: status.version })}</span>{/if}
      <div class="switches">
        <div class="seg" role="group" aria-label={$t('ui.lang.label')}>
          {#each LANGS as l}
            <button class:active={$lang === l} aria-pressed={$lang === l} on:click={() => setLang(l)} lang={l}>{langNames[l]}</button>
          {/each}
        </div>
        <div class="seg" role="group" aria-label={$t('ui.theme.label')}>
          {#each themes as value}
            <button class:active={theme === value} aria-pressed={theme === value} on:click={() => chooseTheme(value)}>{$t(`ui.theme.${value}`)}</button>
          {/each}
        </div>
      </div>
    </header>

    {#if showUpdate}
      <div class="banner info" role="status">
        <div>
          <strong>{$t('ui.update.available', { latest: update.latest })}</strong> {$t('ui.update.installed', { current: update.current })}
          {$t('ui.update.how')} <code>{update.command}</code>{$t('ui.update.restart')}
        </div>
        <button class="link" on:click={dismissUpdate}>{$t('ui.update.dismiss')}</button>
      </div>
    {/if}

    {#if status?.agent === 'missing'}
      <div class="banner warn" role="alert">
        <div>
          <strong>{$t('ui.agentMissing.title')}</strong> {$t('ui.agentMissing.text')}
          <code>npm install -g {status.install}</code>
        </div>
      </div>
    {:else if status?.agent === 'no_screen_recording'}
      <div class="banner warn" role="alert">
        <div>
          <strong>{$t('ui.noScreen.title')}</strong> {$t('ui.noScreen.text')}
          {$t('ui.noScreen.help')} <code>npx agent-desktop permissions --guide</code>
        </div>
      </div>
    {:else if status?.agent === 'no_permission'}
      <div class="banner warn" role="alert">
        <div>
          <strong>{$t('ui.noPermission.title')}</strong> {$t('ui.noPermission.text')}
        </div>
      </div>
    {/if}

    {#if error}<p class="bad" role="alert">{error}</p>{/if}

    <div class="layout">
      <nav aria-label={$t('ui.configs')}>
        <h2>{$t('ui.configs')}</h2>
        <ul>
          {#each configs as c (c.id)}
            <li>
              <button class="item" class:selected={c.id === selectedId && mode !== 'new'} on:click={() => pick(c.id)}>
                <span class="name">{c.name}</span>
                <span class="route muted small">{c.steps[0].source.windowContains} → {c.steps[0].target.windowContains}{c.steps.length > 1 ? ` · ${$t('ui.stepCount', { count: c.steps.length })}` : ''}</span>
                <span class="last small" class:ok={c.lastRun?.ok} class:bad={c.lastRun && !c.lastRun.ok}>
                  {#if c.lastRun}{c.lastRun.ok ? '✓' : '✗'} {$t('ui.lastRunAgo', { ago: ago(c.lastRun.at, $lang) })}{:else}<span class="muted">{$t('ui.neverRun')}</span>{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <button class="newbtn" on:click={() => { mode = 'new'; }} class:selected={mode === 'new'}>{$t('ui.newConfig')}</button>
      </nav>

      <section class="content">
        {#if mode === 'new'}
          <ConfigEditor config={null} agentOk={status?.agent === 'ok'} on:saved={saved} on:cancel={() => (mode = 'view')} />
        {:else if mode === 'edit' && selected}
          <ConfigEditor config={selected} agentOk={status?.agent === 'ok'} on:saved={saved} on:cancel={() => (mode = 'view')} />
        {:else if selected}
          <ConfigDetail config={selected} on:edit={() => (mode = 'edit')} on:ran={loadConfigs} on:removed={removed} />
        {:else}
          <div class="card empty">
            <h2>{$t('ui.empty.title')}</h2>
            <p class="muted">{$t('ui.empty.text')}</p>
            <button class="primary big" on:click={() => (mode = 'new')}>{$t('ui.empty.button')}</button>
          </div>
        {/if}
      </section>
    </div>

    <footer>
      {$t('ui.footer.help')}
      <a href="https://www.digitaldavid.de/copypastepilot" target="_blank" rel="noopener noreferrer">www.digitaldavid.de/copypastepilot</a>
      ·
      <a href="https://github.com/andreas-david/copypastepilot/issues" target="_blank" rel="noopener noreferrer">{$t('ui.footer.issues')}</a>
    </footer>
  </div>
{/if}

<style>
  footer a { color: var(--accent); }
  footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.875rem; color: var(--muted); text-align: center; }
  .shell { max-width: 1100px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
  .narrow { max-width: 560px; margin: 4rem auto; padding: 0 1rem; }
  header { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 1rem; }
  header h1 { margin: 0; }
  .switches { margin-left: auto; display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: flex-end; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .seg button { border: 0; border-radius: 0; padding: 0.3rem 0.7rem; font-size: 0.875rem; background: var(--panel); }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.active { background: var(--accent); color: var(--accent-text); }
  .layout { display: grid; grid-template-columns: 290px 1fr; gap: 1.25rem; align-items: start; }
  @media (max-width: 820px) { .layout { grid-template-columns: 1fr; } }
  nav ul { list-style: none; margin: 0 0 0.75rem; padding: 0; display: grid; gap: 0.4rem; }
  .item { width: 100%; text-align: left; display: grid; gap: 0.1rem; padding: 0.65rem 0.8rem; }
  .item.selected, .newbtn.selected { background: var(--sel); border-color: var(--accent); }
  .name { font-weight: 600; }
  .route { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .newbtn { width: 100%; border-style: dashed; }
  .empty { text-align: center; padding: 2.5rem 1.5rem; }
</style>
