import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTabTitle } from './windows.js';

test('cleanTabTitle mit geschützten Leerzeichen', () => {
  assert.equal(cleanTabTitle('Seite\u00a0– Arbeitsspeichernutzung – 12,2\u202fMB'), 'Seite');
});

test('cleanTabTitle entfernt Speicherzusätze von Chrome', () => {
  assert.equal(cleanTabTitle('(3) Feed | LinkedIn – Hohe Arbeitsspeichernutzung – 831 MB'), '(3) Feed | LinkedIn');
  assert.equal(cleanTabTitle('IT-Wissen für Kids – Arbeitsspeichernutzung – 40,5 MB'), 'IT-Wissen für Kids');
  assert.equal(cleanTabTitle('Seite – Teil zwei'), 'Seite – Teil zwei');
  assert.equal(cleanTabTitle('localhost – Netzwerkfehler'), 'localhost – Netzwerkfehler');
});
