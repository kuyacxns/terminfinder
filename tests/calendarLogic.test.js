import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateByDate,
  buildMonthGrid,
  getTopDays,
  isEmptyEntry,
  isWeekend,
  ownAvailableDates,
  ownEntryFor,
  rankDays,
  shiftMonth,
} from '../js/calendarLogic.js';

/** Baut einen Eintrag in der Form, wie ihn die Datenbank liefert. */
function entry(name, date, overrides = {}) {
  return {
    user_id: `user-${name.toLowerCase()}`,
    date,
    is_available: true,
    all_day: true,
    start_time: null,
    end_time: null,
    note: null,
    profiles: { display_name: name, avatar_emoji: '🦊', avatar_color: '#ef4444' },
    ...overrides,
  };
}

const entries = [
  entry('Anna', '2026-09-01'),
  entry('Ben', '2026-09-01'),
  entry('Cem', '2026-09-01'),
  entry('Anna', '2026-09-02'),
  entry('Ben', '2026-09-02'),
  entry('Anna', '2026-09-03'),
];

test('aggregateByDate zählt nur, wer wirklich Zeit hat', () => {
  const byDate = aggregateByDate([
    entry('Anna', '2026-09-01'),
    entry('Ben', '2026-09-01', { is_available: false, note: 'Bin krank' }),
  ]);

  assert.equal(byDate.get('2026-09-01').count, 1);
  assert.deepEqual(
    byDate.get('2026-09-01').available.map((e) => e.profiles.display_name),
    ['Anna']
  );
});

test('aggregateByDate sammelt Notizen auch von Leuten ohne Zeit', () => {
  const byDate = aggregateByDate([
    entry('Anna', '2026-09-01', { note: 'Bringe Kuchen mit' }),
    entry('Ben', '2026-09-01', { is_available: false, note: 'Bin im Urlaub' }),
    entry('Cem', '2026-09-01'),
  ]);

  const day = byDate.get('2026-09-01');
  assert.equal(day.count, 2);
  assert.deepEqual(day.notes.map((e) => e.profiles.display_name), ['Anna', 'Ben']);
});

test('aggregateByDate ignoriert leere Notizen', () => {
  const byDate = aggregateByDate([entry('Anna', '2026-09-01', { note: '   ' })]);
  assert.deepEqual(byDate.get('2026-09-01').notes, []);
});

test('aggregateByDate sortiert die Namen alphabetisch', () => {
  const byDate = aggregateByDate([
    entry('Zoe', '2026-09-01'),
    entry('Anna', '2026-09-01'),
    entry('Örs', '2026-09-01'),
  ]);

  assert.deepEqual(
    byDate.get('2026-09-01').available.map((e) => e.profiles.display_name),
    ['Anna', 'Örs', 'Zoe']
  );
});

test('rankDays sortiert absteigend nach Anzahl, bei Gleichstand nach Datum', () => {
  const ranked = rankDays([
    entry('Anna', '2026-09-05'),
    entry('Ben', '2026-09-02'),
    entry('Anna', '2026-09-02'),
    entry('Cem', '2026-09-03'),
  ]);

  assert.deepEqual(ranked.map((day) => day.date), ['2026-09-02', '2026-09-03', '2026-09-05']);
  assert.deepEqual(ranked.map((day) => day.rank), [1, 2, 2]);
});

test('rankDays vergibt bei Gleichstand denselben Platz (dense ranking)', () => {
  const byDate = Object.fromEntries(rankDays(entries).map((day) => [day.date, day]));

  assert.equal(byDate['2026-09-01'].rank, 1);
  assert.equal(byDate['2026-09-02'].rank, 2);
  assert.equal(byDate['2026-09-03'].rank, 3);
});

test('rankDays lässt Tage ohne Verfügbarkeit weg (reine Notiz-Tage)', () => {
  const ranked = rankDays([entry('Anna', '2026-09-01', { is_available: false, note: 'Absage' })]);
  assert.deepEqual(ranked, []);
});

test('rankDays kann vergangene Tage ausblenden', () => {
  const ranked = rankDays(entries, { from: '2026-09-02' });
  assert.deepEqual(ranked.map((day) => day.date), ['2026-09-02', '2026-09-03']);
});

test('getTopDays zeigt bei Gleichstand um Platz 3 alle gleichauf liegenden Tage', () => {
  const ranked = rankDays([
    ...['a', 'b', 'c', 'd', 'e'].map((n) => entry(n, '2026-09-01')),
    ...['a', 'b', 'c', 'd'].map((n) => entry(n, '2026-09-02')),
    ...['a', 'b', 'c'].map((n) => entry(n, '2026-09-03')),
    ...['a', 'b', 'c'].map((n) => entry(n, '2026-09-04')),
    ...['a', 'b'].map((n) => entry(n, '2026-09-05')),
  ]);

  // 5, 4, 3, 3, 2 Personen -> Plätze 1, 2, 3, 3, 4 -> Top 3 umfasst vier Tage
  assert.deepEqual(
    getTopDays(ranked, 3).map((day) => day.date),
    ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
  );
});

test('getTopDays liefert nichts, solange sich niemand eingetragen hat', () => {
  assert.deepEqual(getTopDays(rankDays([]), 3), []);
});

test('isWeekend erkennt Samstag und Sonntag', () => {
  assert.equal(isWeekend('2026-09-05'), true); // Samstag
  assert.equal(isWeekend('2026-09-06'), true); // Sonntag
  assert.equal(isWeekend('2026-09-07'), false); // Montag
  assert.equal(isWeekend('2026-09-04'), false); // Freitag
});

test('buildMonthGrid liefert 6 Wochen ab Montag mit korrekter Monatszuordnung', () => {
  // 1. September 2026 ist ein Dienstag -> genau ein Tag Vorlauf (Montag, 31.08.).
  const cells = buildMonthGrid(2026, 9);

  assert.equal(cells.length, 42);
  assert.equal(cells[0].iso, '2026-08-31');
  assert.equal(cells[0].inCurrentMonth, false);
  assert.equal(cells[1].iso, '2026-09-01');
  assert.equal(cells[1].inCurrentMonth, true);
  assert.equal(cells.filter((cell) => cell.inCurrentMonth).length, 30);
  assert.equal(cells[41].iso, '2026-10-11');
});

test('buildMonthGrid markiert die Wochenenden', () => {
  const cells = buildMonthGrid(2026, 9);

  // Spalten 5 und 6 jeder Zeile sind Samstag und Sonntag.
  assert.equal(cells[5].weekend, true);
  assert.equal(cells[6].weekend, true);
  assert.equal(cells[0].weekend, false);
  assert.equal(cells.filter((cell) => cell.weekend).length, 12);
});

test('buildMonthGrid kommt mit Monaten klar, die an einem Montag beginnen', () => {
  const cells = buildMonthGrid(2026, 6); // 1. Juni 2026 ist ein Montag
  assert.equal(cells[0].iso, '2026-06-01');
  assert.equal(cells[0].inCurrentMonth, true);
});

test('buildMonthGrid berücksichtigt Schaltjahre', () => {
  assert.equal(buildMonthGrid(2028, 2).filter((cell) => cell.inCurrentMonth).length, 29);
});

test('shiftMonth rechnet über Jahresgrenzen hinweg', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 9, 0), { year: 2026, month: 9 });
});

test('ownEntryFor findet den eigenen Eintrag', () => {
  const found = ownEntryFor(entries, 'user-anna', '2026-09-02');
  assert.equal(found.is_available, true);
  assert.equal(found.profiles.display_name, 'Anna');
});

test('ownEntryFor liefert einen leeren Standard-Eintrag für neue Tage', () => {
  const fresh = ownEntryFor(entries, 'user-anna', '2026-12-24');

  assert.equal(fresh.is_available, false);
  assert.equal(fresh.all_day, true);
  assert.equal(fresh.start_time, null);
  assert.equal(fresh.note, '');
});

test('ownAvailableDates listet nur die eigenen Tage mit Zeit', () => {
  assert.deepEqual(
    [...ownAvailableDates(entries, 'user-ben')].sort(),
    ['2026-09-01', '2026-09-02']
  );
});

test('ownAvailableDates ignoriert Tage, an denen nur eine Notiz steht', () => {
  const withNote = [entry('Ben', '2026-10-01', { is_available: false, note: 'Keine Zeit' })];
  assert.deepEqual([...ownAvailableDates(withNote, 'user-ben')], []);
});

test('isEmptyEntry erkennt Einträge, die gelöscht statt gespeichert werden', () => {
  assert.equal(isEmptyEntry({ is_available: false, note: '' }), true);
  assert.equal(isEmptyEntry({ is_available: false, note: '   ' }), true);
  assert.equal(isEmptyEntry({ is_available: false, note: 'Bin im Urlaub' }), false);
  assert.equal(isEmptyEntry({ is_available: true, note: '' }), false);
});
