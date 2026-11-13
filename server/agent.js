// Aufruf von agent-desktop. Der Server führt nur feste, hier definierte Befehle aus – nie Text aus dem Browser.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export class AgentError extends Error {
  constructor(message, code = 'FEHLER') {
    super(message);
    this.code = code;
  }
}

let cachedBinary = null;

/** Bevorzugt die mitinstallierte Abhängigkeit, sonst agent-desktop aus dem PATH. */
export function binaryPath() {
  if (cachedBinary) return cachedBinary;
  if (process.env.AGENT_DESKTOP) return (cachedBinary = process.env.AGENT_DESKTOP);
  try {
    const require = createRequire(import.meta.url);
    const dir = path.join(path.dirname(require.resolve('agent-desktop/package.json')), 'bin');
    for (const name of ['agent-desktop', 'agent-desktop.exe']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return (cachedBinary = p);
    }
  } catch {
    /* Abhängigkeit nicht auffindbar: PATH versuchen */
  }
  return (cachedBinary = 'agent-desktop');
}

/** Führt einen Befehl aus und liefert das Feld `data`. Wirft AgentError, wenn ok=false. */
export function ad(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath(),
      args.map(String),
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        let res = null;
        try {
          res = JSON.parse(stdout);
        } catch {
          /* kein JSON */
        }
        if (!res) {
          if (err && err.code === 'ENOENT') return reject(new AgentError('agent-desktop nicht gefunden', 'MISSING'));
          if (err && err.killed) return reject(new AgentError('agent-desktop Zeitüberschreitung', 'TIMEOUT'));
          return reject(new AgentError('agent-desktop lieferte keine Antwort', 'NO_JSON'));
        }
        if (!res.ok) {
          const e = res.error || {};
          return reject(new AgentError(`${e.code || 'FEHLER'}: ${e.message || ''}`, e.code || 'FEHLER'));
        }
        resolve(res.data);
      },
    );
  });
}

/**
 * 'ok' | 'missing' (nicht lauffähig) | 'no_permission' (Bedienungshilfen fehlen)
 * | 'no_screen_recording' (macOS gibt ohne Bildschirmaufnahme-Freigabe keine Fenstertitel heraus).
 * Wir nehmen nichts auf; die Freigabe wird nur gebraucht, damit Fenster am Titel erkannt werden.
 */
export async function agentState() {
  try {
    const d = await ad(['permissions'], 15000);
    if (d?.accessibility?.state !== 'granted') return 'no_permission';
    if (d?.screen_recording?.state === 'denied') return 'no_screen_recording';
    return 'ok';
  } catch {
    return 'missing';
  }
}

// agent-desktop verträgt keine parallelen Zugriffe gut: Aufträge laufen nacheinander.
let chain = Promise.resolve();
export function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
