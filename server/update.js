// Hinweis auf neue Versionen. Fragt die npm-Registry nach der neuesten veröffentlichten Version
// (es werden weder Nutzerdaten noch Konfigurationen gesendet). Abschaltbar: EASYCOPY_NO_UPDATE_CHECK=1.
const DAY = 24 * 60 * 60 * 1000;

/** Vergleicht x.y.z numerisch; Vorabversionen (-beta) gelten als kleiner als die fertige Version. */
export function isNewer(latest, current) {
  const parse = (v) => {
    const [core, pre] = String(v).split('-');
    return { n: core.split('.').map((x) => parseInt(x, 10) || 0), pre: !!pre };
  };
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a.n[i] || 0) !== (b.n[i] || 0)) return (a.n[i] || 0) > (b.n[i] || 0);
  }
  return b.pre && !a.pre;
}

export function createUpdateChecker({ name, version, registry, intervalMs = DAY / 4 }) {
  const state = { latest: null, checkedAt: null };
  const disabled = !!process.env.EASYCOPY_NO_UPDATE_CHECK;
  const base = (process.env.EASYCOPY_REGISTRY_URL || registry || 'https://registry.npmjs.org').replace(/\/$/, '');

  async function check() {
    if (disabled) return;
    try {
      const url = base.endsWith('.json') ? base : `${base}/${encodeURIComponent(name)}/latest`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
      if (!res.ok) return; // z. B. noch nicht veröffentlicht: kein Hinweis, kein Fehler
      const data = await res.json();
      if (typeof data.version === 'string') {
        state.latest = data.version;
        state.checkedAt = new Date().toISOString();
      }
    } catch {
      /* offline o. Ä.: stillschweigend ignorieren */
    }
  }

  let timer = null;
  return {
    start() {
      check();
      timer = setInterval(check, intervalMs);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
    check,
    info() {
      const available = !!state.latest && isNewer(state.latest, version);
      return {
        current: version,
        latest: state.latest,
        available,
        command: available ? `npm install -g ${name}@latest` : null,
        npxCommand: available ? `npx ${name}@latest` : null,
        enabled: !disabled,
      };
    },
  };
}
