import test from 'node:test';
import assert from 'node:assert/strict';
import { binaryNames } from './agent.js';

test('Windows nimmt nur .exe-Dateien, mit Rückfall auf die mitgelieferte Datei', () => {
  assert.deepEqual(binaryNames('win32', 'x64'), ['agent-desktop.exe', 'agent-desktop-win32-x64.exe']);
  assert.deepEqual(binaryNames('win32', 'arm64'), ['agent-desktop.exe', 'agent-desktop-win32-arm64.exe']);
});

test('macOS und Linux nehmen die Datei ohne Endung', () => {
  assert.deepEqual(binaryNames('darwin', 'arm64'), ['agent-desktop', 'agent-desktop-darwin-arm64']);
  assert.deepEqual(binaryNames('linux', 'x64'), ['agent-desktop', 'agent-desktop-linux-x64']);
});
