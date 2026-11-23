#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  const de = /^de/i.test(process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '');
  console.error(
    de
      ? `Node.js 18 oder neuer wird gebraucht (gefunden: ${process.versions.node}). Bitte von https://nodejs.org installieren.`
      : `Node.js 18 or newer is required (found: ${process.versions.node}). Please install it from https://nodejs.org.`,
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

// Sprache der Terminal-Ausgabe: --lang, sonst Umgebung (COPYPASTEPILOT_LANG, LC_ALL, LANG), sonst Systemsprache, sonst Englisch.
const { setDefaultLang, langFromEnv, t } = await import('../server/i18n.js');
const { normalizeLang } = await import('../locales/index.js');
const langArg = args.indexOf('--lang');
setDefaultLang(
  (langArg >= 0 && normalizeLang(args[langArg + 1])) || langFromEnv() || normalizeLang(Intl.DateTimeFormat().resolvedOptions().locale),
);

const SITE = 'https://www.digitaldavid.de/copypastepilot';
const ISSUES = 'https://github.com/andreas-david/copypastepilot/issues';

if (args.includes('--help') || args.includes('-h')) {
  console.log(t('cli.help', { name: pkg.name, version: pkg.version }));
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes('--check')) {
  const { agentState: state, binaryPath: bin } = await import('../server/agent.js');
  const { homeDir: home } = await import('../server/configs.js');
  const { INSTALL_SPEC: install } = await import('../server/update.js');
  const st = await state();
  const row = (label, value) => `${t(`cli.label.${label}`)}:`.padEnd(18) + value;
  console.log(
    [
      `CopyPastePilot ${pkg.version}`,
      row('node', `${process.versions.node} ${major >= 18 ? t('cli.nodeOk') : t('cli.nodeOld')}`),
      row('system', `${process.platform} ${process.arch}`),
      row('agent', bin()),
      row('state', t(`cli.state.${st}`, { install })),
      row('configs', home()),
      t('cli.contact', { site: SITE, issues: ISSUES }),
    ].join('\n'),
  );
  process.exit(st === 'ok' ? 0 : 2);
}

const { createServer } = await import('../server/http.js');
const { createUpdateChecker, INSTALL_SPEC } = await import('../server/update.js');
const { agentState, binaryPath } = await import('../server/agent.js');
const { homeDir, migrateLegacyHome } = await import('../server/configs.js');
const migrated = process.env.COPYPASTEPILOT_HOME ? null : migrateLegacyHome();

const portArg = args.indexOf('--port');
const wanted = portArg >= 0 ? Number(args[portArg + 1]) : Number(process.env.COPYPASTEPILOT_PORT || 8766);
if (!Number.isInteger(wanted) || wanted < 1024 || wanted > 65535) {
  console.error(t('cli.badPort'));
  process.exit(1);
}

const token = process.env.COPYPASTEPILOT_TOKEN || crypto.randomBytes(16).toString('base64url');
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
  throw new Error(t('cli.noFreePort', { port }));
}

const { port } = await listen(wanted);
const url = `http://127.0.0.1:${port}/?t=${token}`;
if (migrated) console.log(`${t('cli.migrated', { from: migrated })}\n`);
console.log(t('cli.running', { name: 'CopyPastePilot', version: pkg.version, url, home: homeDir(), site: SITE, issues: ISSUES }));

const state = await agentState();
if (['missing', 'no_screen_recording', 'no_permission'].includes(state)) {
  console.warn(`\n${t(`cli.hint.${state}`, { path: binaryPath(), install: INSTALL_SPEC })}`);
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
