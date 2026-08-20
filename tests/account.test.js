import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeName,
  formatAvailabilityTime,
  formatTime,
  nameToAuthEmail,
  nameToSlug,
  validateDisplayName,
  validatePassword,
} from '../js/utils.js';
import { AVATAR_COLORS, AVATAR_EMOJIS, defaultAvatarFor, initialsFor } from '../js/avatar.js';

test('canonicalizeName trimmt außen und fasst Leerraum innen zusammen', () => {
  assert.equal(canonicalizeName('  Anna   Müller  '), 'Anna Müller');
  assert.equal(canonicalizeName('Anna\t\nMüller'), 'Anna Müller');
});

test('validateDisplayName akzeptiert Künstlernamen', () => {
  assert.deepEqual(validateDisplayName('Krümelmonster'), { ok: true, value: 'Krümelmonster' });
  assert.deepEqual(validateDisplayName('DJ 4Real'), { ok: true, value: 'DJ 4Real' });
  assert.deepEqual(validateDisplayName('  Anna  '), { ok: true, value: 'Anna' });
});

test('validateDisplayName lehnt leere, zu kurze und zu lange Namen ab', () => {
  assert.equal(validateDisplayName('').ok, false);
  assert.equal(validateDisplayName('   ').ok, false);
  assert.equal(validateDisplayName('A').ok, false);
  assert.equal(validateDisplayName('x'.repeat(41)).ok, false);
  assert.equal(validateDisplayName('x'.repeat(40)).ok, true);
});

test('validateDisplayName verlangt mindestens einen Buchstaben oder eine Zahl', () => {
  assert.equal(validateDisplayName('!!!').ok, false);
  assert.equal(validateDisplayName('***').ok, false);
  assert.equal(validateDisplayName('A1').ok, true);
});

test('validatePassword verlangt mindestens 8 Zeichen', () => {
  assert.equal(validatePassword('kurz').ok, false);
  assert.equal(validatePassword('1234567').ok, false);
  assert.equal(validatePassword('12345678').ok, true);
});

test('nameToSlug schreibt Umlaute aus und entfernt Akzente', () => {
  assert.equal(nameToSlug('Anna Müller'), 'anna-mueller');
  assert.equal(nameToSlug('Jörg Weiß'), 'joerg-weiss');
  assert.equal(nameToSlug('José'), 'jose');
});

test('nameToSlug kann für Namen ohne lateinische Zeichen leer werden', () => {
  assert.equal(nameToSlug('😀'), '');
  assert.equal(nameToSlug('Анна'), '');
});

test('nameToAuthEmail ist für denselben Namen stabil', () => {
  assert.equal(nameToAuthEmail('Anna Müller'), nameToAuthEmail('  anna   MÜLLER '));
});

test('nameToAuthEmail unterscheidet Namen mit gleicher Kurzform', () => {
  assert.notEqual(nameToAuthEmail('Anna Müller'), nameToAuthEmail('Anna-Mueller'));
});

test('nameToAuthEmail liefert auch ohne lateinische Zeichen eine gültige Adresse', () => {
  const email = nameToAuthEmail('Анна');

  assert.match(email, /^[a-z0-9][a-z0-9-]*@example\.com$/);
  assert.notEqual(nameToAuthEmail('Анна'), nameToAuthEmail('😀'));
});

test('defaultAvatarFor ist deterministisch und liefert gültige Werte', () => {
  const first = defaultAvatarFor('Anna Müller');
  const second = defaultAvatarFor('  anna   müller ');

  assert.deepEqual(first, second);
  assert.ok(AVATAR_EMOJIS.includes(first.emoji));
  assert.ok(AVATAR_COLORS.includes(first.color));
});

test('defaultAvatarFor verteilt verschiedene Namen auf verschiedene Bilder', () => {
  const avatars = new Set(
    ['Anna', 'Ben', 'Cem', 'Dora', 'Emil', 'Fritz', 'Gundi', 'Hans'].map((name) => {
      const avatar = defaultAvatarFor(name);
      return `${avatar.emoji}${avatar.color}`;
    })
  );

  assert.ok(avatars.size >= 6, `zu wenig Streuung: ${avatars.size} von 8`);
});

test('defaultAvatarFor liefert nur gültige Farbwerte', () => {
  for (const name of ['a', 'bb', 'ccc', 'Zoe', '😀', 'Анна']) {
    assert.match(defaultAvatarFor(name).color, /^#[0-9a-f]{6}$/i);
  }
});

test('initialsFor bildet sinnvolle Kürzel', () => {
  assert.equal(initialsFor('Anna Müller'), 'AM');
  assert.equal(initialsFor('Krümelmonster'), 'KR');
  assert.equal(initialsFor('  '), '?');
});

test('formatTime kürzt Postgres-Zeiten auf HH:MM', () => {
  assert.equal(formatTime('18:00:00'), '18:00');
  assert.equal(formatTime('09:30'), '09:30');
  assert.equal(formatTime(null), '');
});

test('formatAvailabilityTime beschreibt ganztägig, offene und feste Zeiten', () => {
  assert.equal(formatAvailabilityTime({ all_day: true }), 'ganztägig');
  assert.equal(
    formatAvailabilityTime({ all_day: false, start_time: '18:00:00', end_time: null }),
    'ab 18:00'
  );
  assert.equal(
    formatAvailabilityTime({ all_day: false, start_time: '18:00:00', end_time: '21:30:00' }),
    '18:00 – 21:30'
  );
});

test('formatAvailabilityTime fällt ohne Startzeit auf ganztägig zurück', () => {
  assert.equal(formatAvailabilityTime({ all_day: false, start_time: null }), 'ganztägig');
});
