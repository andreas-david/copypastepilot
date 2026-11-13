import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer } from './update.js';

test('neuere Version wird erkannt', () => {
  assert.equal(isNewer('0.2.0', '0.1.0'), true);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.1.10', '0.1.9'), true); // numerisch, nicht als Text
});

test('gleiche oder ältere Version gibt keinen Hinweis', () => {
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.1.0', '0.2.0'), false);
  assert.equal(isNewer('1.9.9', '2.0.0'), false);
});

test('Vorabversion gilt als älter als die fertige', () => {
  assert.equal(isNewer('1.0.0', '1.0.0-beta.1'), true);
  assert.equal(isNewer('1.0.0-beta.1', '1.0.0'), false);
});
