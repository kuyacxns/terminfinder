import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isValidDateString, isValidName, MAX_NAME_LENGTH } from '../js/utils.js';

test('escapeHtml escaped gefährliche Zeichen (XSS-Schutz)', () => {
  const input = '<script>alert("x")</script>&\'';
  const escaped = escapeHtml(input);
  assert.ok(!escaped.includes('<script>'));
  assert.equal(escaped, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;');
});

test('isValidDateString akzeptiert nur gültige ISO-Daten (YYYY-MM-DD)', () => {
  assert.equal(isValidDateString('2026-09-01'), true);
  assert.equal(isValidDateString('2026-13-40'), false);
  assert.equal(isValidDateString('2026-2-1'), false);
  assert.equal(isValidDateString('not-a-date'), false);
  assert.equal(isValidDateString(''), false);
  assert.equal(isValidDateString(null), false);
  assert.equal(isValidDateString(undefined), false);
});

test('isValidName prüft Länge und Inhalt', () => {
  assert.equal(isValidName('Anna'), true);
  assert.equal(isValidName('   '), false);
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('a'.repeat(MAX_NAME_LENGTH)), true);
  assert.equal(isValidName('a'.repeat(MAX_NAME_LENGTH + 1)), false);
  assert.equal(isValidName(null), false);
});
