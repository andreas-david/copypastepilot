import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { binaryNames, findOnPath } from './agent.js';

test('Windows nimmt nur .exe-Dateien, mit Rückfall auf die mitgelieferte Datei', () => {
  assert.deepEqual(binaryNames('win32', 'x64'), ['agent-desktop.exe', 'agent-desktop-win32-x64.exe']);
  assert.deepEqual(binaryNames('win32', 'arm64'), ['agent-desktop.exe', 'agent-desktop-win32-arm64.exe']);
});

test('macOS und Linux nehmen die Datei ohne Endung', () => {
  assert.deepEqual(binaryNames('darwin', 'arm64'), ['agent-desktop', 'agent-desktop-darwin-arm64']);
  assert.deepEqual(binaryNames('linux', 'x64'), ['agent-desktop', 'agent-desktop-linux-x64']);
});

test('findOnPath: Windows-Installation mit .cmd findet die .exe daneben', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-path-'));
  fs.writeFileSync(path.join(d, 'agent-desktop.cmd'), '@echo off');
  const bin = path.join(d, 'node_modules', 'agent-desktop', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'agent-desktop.exe'), '');
  assert.equal(findOnPath(d, 'win32', 'x64'), path.join(bin, 'agent-desktop.exe'));
});

test('findOnPath: .exe direkt im PATH, und nichts gefunden', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-path-'));
  fs.writeFileSync(path.join(d, 'agent-desktop.exe'), '');
  assert.equal(findOnPath(d, 'win32', 'x64'), path.join(d, 'agent-desktop.exe'));
  assert.equal(findOnPath(os.tmpdir() + path.sep + 'gibts-nicht', 'win32', 'x64'), null);
});
