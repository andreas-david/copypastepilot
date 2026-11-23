// Aufruf von agent-desktop. Der Server führt nur feste, hier definierte Befehle aus – nie Text aus dem Browser.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { t } from './i18n.js';

export class AgentError extends Error {
  constructor(message, code = 'FEHLER') {
    super(message);
    this.code = code;
  }
}

let cachedBinary = null;

/** Mögliche Dateinamen des Programms im bin-Ordner von agent-desktop, beste zuerst. */
export function binaryNames(platform = process.platform, arch = process.arch) {
  const exe = platform === 'win32' ? '.exe' : '';
  // Unter Windows zählt nur eine .exe: die Datei ohne Endung ist dort nicht ausführbar.
  const direct = platform === 'win32' ? ['agent-desktop.exe'] : ['agent-desktop'];
  // Falls das Nachinstallations-Skript von agent-desktop nicht lief: die mitgelieferte Datei für diese Plattform nehmen.
  return [...direct, `agent-desktop-${platform}-${arch}${exe}`];
}

/**
 * Sucht agent-desktop in den Ordnern des PATH (z. B. nach `npm install -g agent-desktop`).
 * Unter Windows steht dort nur agent-desktop.cmd, die nicht direkt startbar ist; die echte .exe liegt daneben unter
 * node_modules/agent-desktop/bin.
 */
export function findOnPath(pathVar = process.env.PATH || process.env.Path || '', platform = process.platform, arch = process.arch) {
  const names = binaryNames(platform, arch);
  for (const dir of pathVar.split(path.delimiter).filter(Boolean)) {
    for (const n of names.slice(0, 1)) {
      const p = path.join(dir, n);
      if (fs.existsSync(p)) return p;
    }
    if (platform === 'win32' && fs.existsSync(path.join(dir, 'agent-desktop.cmd'))) {
      for (const n of names) {
        const p = path.join(dir, 'node_modules', 'agent-desktop', 'bin', n);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

/** Bevorzugt die mitinstallierte Abhängigkeit, sonst agent-desktop aus dem PATH. */
export function binaryPath() {
  if (cachedBinary) return cachedBinary;
  if (process.env.AGENT_DESKTOP) return (cachedBinary = process.env.AGENT_DESKTOP);
  try {
    const require = createRequire(import.meta.url);
    const dir = path.join(path.dirname(require.resolve('agent-desktop/package.json')), 'bin');
    for (const name of binaryNames()) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return (cachedBinary = p);
    }
  } catch {
    /* Abhängigkeit nicht auffindbar: PATH versuchen */
  }
  return (cachedBinary = findOnPath() || (process.platform === 'win32' ? 'agent-desktop.exe' : 'agent-desktop'));
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
          if (err && err.code === 'ENOENT') return reject(new AgentError(t('agent.missing'), 'MISSING'));
          if (err && err.killed) return reject(new AgentError(t('agent.timeout'), 'TIMEOUT'));
          return reject(new AgentError(t('agent.noResponse'), 'NO_JSON'));
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
