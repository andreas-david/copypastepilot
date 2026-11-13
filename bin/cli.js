#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`Node.js 18 oder neuer wird gebraucht (gefunden: ${process.versions.node}). Bitte von https://nodejs.org installieren.`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`${pkg.name} ${pkg.version}

Kopiert Felder von einem Programmfenster in ein anderes. Läuft nur auf diesem Rechner.

  ${pkg.name} [--port 8766] [--no-open]

  --port N     Port des lokalen Servers (Standard 8766)
  --no-open    Browser nicht automatisch öffnen
  --version    Version anzeigen

Umgebung: EASYCOPY_HOME (Ordner für Konfigurationen), EASYCOPY_NO_UPDATE_CHECK=1`);
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

const { createServer } = await import('../server/http.js');
const { createUpdateChecker, INSTALL_SPEC } = await import('../server/update.js');
const { agentState, binaryPath } = await import('../server/agent.js');
const { homeDir, migrateLegacyHome } = await import('../server/configs.js');
const migrated = !process.env.EASYCOPY_HOME && migrateLegacyHome();

const portArg = args.indexOf('--port');
const wanted = portArg >= 0 ? Number(args[portArg + 1]) : Number(process.env.EASYCOPY_PORT || 8766);
if (!Number.isInteger(wanted) || wanted < 1024 || wanted > 65535) {
  console.error('Ungültiger Port (erlaubt: 1024–65535).');
  process.exit(1);
}

const token = process.env.EASYCOPY_TOKEN || crypto.randomBytes(16).toString('base64url');
const updates = createUpdateChecker({ version: pkg.version });

async function listen(port) {
  for (let p = port; p < port + 20; p++) {
    const server = createServer({ token, port: p, version: pkg.version, name: pkg.name, webDir: path.join(root, 'web-dist'), updates });
    const ok = await new Promise((resolve) => {
      server.once('error', (e) => resolve(e.code === 'EADDRINUSE' ? false : Promise.reject(e)));
      server.listen(p, '127.0.0.1', () => resolve(true));
    });
    if (ok) return { server, port: p };
  }
  throw new Error(`Kein freier Port ab ${port} gefunden.`);
}

const { port } = await listen(wanted);
const url = `http://127.0.0.1:${port}/?t=${token}`;
if (migrated) console.log('Konfigurationen aus ~/.field-copier wurden nach ~/.easycopy kopiert (der alte Ordner bleibt bestehen).\n');
console.log(`${pkg.name} ${pkg.version} läuft.\n\n  ${url}\n\nKonfigurationen liegen in: ${homeDir()}\nBeenden mit Strg+C.`);

const state = await agentState();
if (state === 'missing') {
  console.warn(`\nHinweis: agent-desktop ließ sich nicht starten (${binaryPath()}). Bitte neu installieren: npm install -g ${INSTALL_SPEC}`);
} else if (state === 'no_screen_recording') {
  console.warn(`\nHinweis: Es fehlt die Freigabe "Bildschirmaufnahme" (macOS: Systemeinstellungen → Datenschutz & Sicherheit).\nOhne sie sind Fenstertitel nicht lesbar, und Fenster lassen sich nicht erkennen. Es wird nichts aufgenommen.\nHilfe dabei: ${binaryPath()} permissions --guide\nDanach das Programm, aus dem du gestartet hast, neu starten.`);
} else if (state === 'no_permission') {
  console.warn(`\nHinweis: Es fehlt die Freigabe für die Bedienungshilfen (macOS: Systemeinstellungen → Datenschutz & Sicherheit).\nHilfe dabei: ${binaryPath()} permissions --guide`);
}

updates.start();

if (!args.includes('--no-open') && process.env.CI !== 'true') {
  const [cmd, cmdArgs] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    /* Browser manuell öffnen */
  }
}
