import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateGerman, isValidName, MAX_NAME_LENGTH } from '../js/utils.js';

test('isValidName prüft Länge und Inhalt', () => {
  assert.equal(isValidName('Anna'), true);
  assert.equal(isValidName('   '), false);
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('a'.repeat(MAX_NAME_LENGTH)), true);
  assert.equal(isValidName('a'.repeat(MAX_NAME_LENGTH + 1)), false);
  assert.equal(isValidName(null), false);
});

test('formatDateGerman formatiert unabhängig von der lokalen Zeitzone', () => {
  // Ohne UTC-Fixierung würde der 01.09. in westlichen Zeitzonen als 31.08.
  // dargestellt – der Kalender zeigte dann einen Tag zu früh an.
  assert.match(formatDateGerman('2026-09-01'), /01\.09\.2026/);
  assert.match(formatDateGerman('2026-01-01'), /01\.01\.2026/);
  assert.match(formatDateGerman('2026-12-31'), /31\.12\.2026/);
});
