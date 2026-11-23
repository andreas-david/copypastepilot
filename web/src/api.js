import { get } from 'svelte/store';
import { lang, tNow } from './i18n.js';

// Token aus der Start-URL (?t=…) holen, aus der Adresszeile entfernen und für diese Sitzung merken.
function readToken() {
  const u = new URL(location.href);
  const t = u.searchParams.get('t');
  if (t) {
    try { sessionStorage.setItem('fc-token', t); } catch { /* Speicher gesperrt */ }
    u.searchParams.delete('t');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    return t;
  }
  try { return sessionStorage.getItem('fc-token') || ''; } catch { return ''; }
}

const token = readToken();
export const hasToken = !!token;

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Token': token, 'X-Lang': get(lang) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) {
    const d = data.details ? ': ' + data.details.join('; ') : '';
    throw new Error((data.error || tNow('ui.error')) + d);
  }
  return data;
}

// Der zweite Parameter (Sprache) sorgt nur dafür, dass Svelte die Anzeige bei Sprachwechsel neu berechnet.
export function ago(iso, _lang) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tNow('ui.ago.now');
  if (s < 3600) return tNow('ui.ago.minutes', { count: Math.round(s / 60) });
  if (s < 86400) return tNow('ui.ago.hours', { count: Math.round(s / 3600) });
  return tNow('ui.ago.days', { count: Math.round(s / 86400) });
}
