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
    headers: { 'Content-Type': 'application/json', 'X-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) {
    const d = data.details ? ': ' + data.details.join('; ') : '';
    throw new Error((data.error || 'Fehler') + d);
  }
  return data;
}

export function ago(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return `vor ${Math.round(s / 86400)} Tagen`;
}
