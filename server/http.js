// Lokaler Webserver. Er kann Fensterinhalte lesen und schreiben, deshalb gilt:
//  * nur Host 127.0.0.1 / localhost mit dem richtigen Port (gegen DNS-Rebinding),
//  * Zufalls-Token im Header X-Token für alle /api-Aufrufe,
//  * Anfragen mit fremdem Origin werden abgelehnt, es gibt keine CORS-Freigabe,
//  * die API nimmt nur feste Aktionen an, nie Befehlstext.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AgentError, agentState, exclusive } from './agent.js';
import { listApps, listWindows, assertWindow } from './windows.js';
import { scanFields, copyFields } from './fields.js';
import { checkStep, runStep } from './engine.js';
import { INSTALL_SPEC } from './update.js';
import {
  ValidationError,
  cleanPairs,
  deleteConfig,
  getConfig,
  homeDir,
  listConfigs,
  saveConfig,
  setLastRun,
  normalize,
  stepHash,
  validateConfig,
} from './configs.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

/** Tab-Titel aus der Oberfläche: null oder kurzer Text. */
function cleanTab(t) {
  if (t === undefined || t === null || t === '') return null;
  if (typeof t !== 'string' || t.length > 300) throw new HttpError(400, 'tab ungültig');
  return t;
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function createServer({ token, port, version, name, webDir, updates }) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const proofs = new Map(); // Fingerabdruck → Ablaufzeit: bewiesen durch einen erfolgreichen Probelauf
  let agentCache = { at: 0, state: null };

  const tokenOk = (given) => {
    const a = Buffer.from(String(given || ''));
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  async function agent() {
    if (!agentCache.state || Date.now() - agentCache.at > 10000) {
      agentCache = { at: Date.now(), state: await exclusive(agentState) };
    }
    return agentCache.state;
  }

  function send(res, status, body, type = 'application/json; charset=utf-8') {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 1_000_000) throw new HttpError(413, 'Anfrage zu groß');
      chunks.push(c);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'Ungültiges JSON');
    }
  }

  const needConfig = (id) => getConfig(id) || (() => { throw new HttpError(404, 'Konfiguration nicht gefunden'); })();

  function pruneProofs() {
    const now = Date.now();
    for (const [k, exp] of proofs) if (exp < now) proofs.delete(k);
  }

  function checkSave(rawInput, existing) {
    const input = normalize(rawInput);
    const errors = validateConfig(input);
    if (errors.length) throw new ValidationError(errors);
    pruneProofs();
    // Ein Schritt darf unverändert aus der gespeicherten Konfiguration übernommen werden; neue oder geänderte
    // Schritte brauchen einen erfolgreichen Probelauf mit genau dieser Zuordnung.
    const known = new Set((existing?.steps || []).map(stepHash));
    input.steps.forEach((st, i) => {
      const h = stepHash(st);
      if (!known.has(h) && !proofs.has(h)) {
        throw new HttpError(409, `Schritt ${i + 1}: Gespeichert werden kann erst nach einem erfolgreichen Probelauf mit genau dieser Zuordnung.`);
      }
    });
  }

  function stepIndex(b, config) {
    const i = b.step === undefined ? 0 : b.step;
    if (!Number.isInteger(i) || i < 0 || i >= config.steps.length) throw new HttpError(400, 'Ungültiger Schritt');
    return i;
  }

  async function api(req, res, url) {
    const { pathname } = url;
    const method = req.method;
    let m;

    if (method === 'GET' && pathname === '/api/status') {
      return send(res, 200, { name, version, install: INSTALL_SPEC, agent: await agent(), update: updates.info(), home: homeDir() });
    }
    if (method === 'GET' && pathname === '/api/apps') return send(res, 200, { apps: await exclusive(listApps) });
    if (method === 'GET' && pathname === '/api/windows') {
      const app = url.searchParams.get('app') || '';
      if (!app || app.length > 100) throw new HttpError(400, 'app fehlt');
      return send(res, 200, { windows: await exclusive(() => listWindows(app)) });
    }
    if (method === 'POST' && pathname === '/api/scan') {
      const b = await readBody(req);
      if (typeof b.app !== 'string' || !b.app || b.app.length > 100 || !/^w-\d+$/.test(String(b.windowId))) throw new HttpError(400, 'app oder windowId ungültig');
      const r = await exclusive(async () => {
        await assertWindow(b.app, b.windowId);
        return scanFields(b.app, b.windowId, !!b.includeEmpty, cleanTab(b.tab));
      });
      return send(res, 200, r);
    }

    // Probelauf aus dem Editor: schreibt wirklich ins Ziel; bei Erfolg wird die Zuordnung "bewiesen".
    if (method === 'POST' && pathname === '/api/probe') {
      const b = await readBody(req);
      const draft = {
        name: 'x',
        steps: [
          {
            source: { app: b.source?.app, windowContains: b.source?.windowContains },
            target: { app: b.target?.app, windowContains: b.target?.windowContains },
            pairs: b.pairs,
          },
        ],
      };
      const errors = validateConfig(draft);
      if (errors.length) throw new ValidationError(errors);
      for (const side of ['source', 'target']) {
        if (!/^w-\d+$/.test(String(b[side]?.windowId))) throw new HttpError(400, `${side}.windowId ungültig`);
      }
      const result = await exclusive(async () => {
        await assertWindow(b.source.app, b.source.windowId);
        await assertWindow(b.target.app, b.target.windowId);
        return copyFields(
          { app: b.source.app, id: b.source.windowId, tab: cleanTab(b.source.tab) },
          { app: b.target.app, id: b.target.windowId, tab: cleanTab(b.target.tab) },
          cleanPairs(b.pairs),
        );
      });
      if (result.ok) proofs.set(stepHash(draft.steps[0]), Date.now() + 60 * 60 * 1000);
      return send(res, 200, result);
    }

    if (method === 'GET' && pathname === '/api/configs') return send(res, 200, { configs: listConfigs() });
    if (method === 'POST' && pathname === '/api/configs') {
      const input = await readBody(req);
      checkSave(input, null);
      return send(res, 201, saveConfig(input));
    }
    if ((m = pathname.match(/^\/api\/configs\/([a-z0-9-]+)$/))) {
      if (method === 'GET') return send(res, 200, needConfig(m[1]));
      if (method === 'PUT') {
        const existing = needConfig(m[1]);
        const input = await readBody(req);
        checkSave(input, existing);
        return send(res, 200, saveConfig(input, existing));
      }
      if (method === 'DELETE') {
        needConfig(m[1]);
        deleteConfig(m[1]);
        return send(res, 200, { ok: true });
      }
    }
    if (method === 'POST' && (m = pathname.match(/^\/api\/configs\/([a-z0-9-]+)\/check$/))) {
      const c = needConfig(m[1]);
      const i = stepIndex(await readBody(req), c);
      if ((await agent()) !== 'ok') return send(res, 200, { ready: false, items: [{ ok: false, label: 'agent-desktop nicht bereit', detail: 'Siehe Hinweis oben.' }] });
      return send(res, 200, await exclusive(() => checkStep(c.steps[i], { passive: true })));
    }
    if (method === 'POST' && (m = pathname.match(/^\/api\/configs\/([a-z0-9-]+)\/run$/))) {
      const c = needConfig(m[1]);
      const i = stepIndex(await readBody(req), c);
      if ((await agent()) !== 'ok') throw new HttpError(409, 'agent-desktop ist nicht bereit');
      const result = await exclusive(async () => {
        try {
          return await runStep(c.steps[i]);
        } catch (e) {
          return { ok: false, pairs: [], error: e.message };
        }
      });
      if (result.pairs.length) setLastRun(c.id, i, result);
      return send(res, 200, result);
    }
    throw new HttpError(404, 'Nicht gefunden');
  }

  function serveStatic(res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(webDir, rel);
    if (!file.startsWith(path.resolve(webDir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (!fs.existsSync(path.join(webDir, 'index.html'))) return send(res, 500, 'Oberfläche nicht gebaut (npm run build).', 'text/plain; charset=utf-8');
      return send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
    }
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  }

  return http.createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host || '')) throw new HttpError(403, 'Host nicht erlaubt');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.origin && !origins.has(req.headers.origin)) throw new HttpError(403, 'Origin nicht erlaubt');
        if (!tokenOk(req.headers['x-token'])) throw new HttpError(401, 'Token fehlt oder falsch');
        return await api(req, res, url);
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Methode nicht erlaubt');
      return serveStatic(res, decodeURIComponent(url.pathname));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
      if (e instanceof ValidationError) return send(res, 422, { error: e.message, details: e.details });
      if (e instanceof AgentError) return send(res, 502, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Interner Fehler' });
    }
  });
}
