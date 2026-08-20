import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateByDate,
  buildMonthGrid,
  getTopDays,
  ownDates,
  rankDays,
  shiftMonth,
  withOwnSelection,
} from '../js/calendarLogic.js';

const entries = [
  { participant_name: 'Anna', date: '2026-09-01' },
  { participant_name: 'Ben', date: '2026-09-01' },
  { participant_name: 'Cem', date: '2026-09-01' },
  { participant_name: 'Anna', date: '2026-09-02' },
  { participant_name: 'Ben', date: '2026-09-02' },
  { participant_name: 'Anna', date: '2026-09-03' },
];

test('aggregateByDate zählt Personen pro Tag und sammelt die Namen', () => {
  const byDate = aggregateByDate(entries);

  assert.equal(byDate.get('2026-09-01').count, 3);
  assert.deepEqual(byDate.get('2026-09-01').names, ['Anna', 'Ben', 'Cem']);
  assert.equal(byDate.get('2026-09-03').count, 1);
  assert.deepEqual(byDate.get('2026-09-03').names, ['Anna']);
  assert.equal(byDate.has('2026-09-04'), false);
});

test('rankDays sortiert absteigend nach Anzahl, bei Gleichstand nach Datum', () => {
  const ranked = rankDays([
    { participant_name: 'Anna', date: '2026-09-05' },
    { participant_name: 'Ben', date: '2026-09-02' },
    { participant_name: 'Anna', date: '2026-09-02' },
    { participant_name: 'Cem', date: '2026-09-03' },
  ]);

  assert.deepEqual(
    ranked.map((day) => day.date),
    ['2026-09-02', '2026-09-03', '2026-09-05']
  );
  assert.deepEqual(ranked.map((day) => day.rank), [1, 2, 2]);
});

test('rankDays vergibt bei Gleichstand denselben Platz (dense ranking)', () => {
  const ranked = rankDays(entries);
  const byDate = Object.fromEntries(ranked.map((day) => [day.date, day]));

  assert.equal(byDate['2026-09-01'].rank, 1);
  assert.equal(byDate['2026-09-02'].rank, 2);
  assert.equal(byDate['2026-09-03'].rank, 3);
});

test('getTopDays zeigt bei Gleichstand um Platz 3 alle gleichauf liegenden Tage', () => {
  const ranked = rankDays([
    ...['a', 'b', 'c', 'd', 'e'].map((n) => ({ participant_name: n, date: '2026-09-01' })),
    ...['a', 'b', 'c', 'd'].map((n) => ({ participant_name: n, date: '2026-09-02' })),
    ...['a', 'b', 'c'].map((n) => ({ participant_name: n, date: '2026-09-03' })),
    ...['a', 'b', 'c'].map((n) => ({ participant_name: n, date: '2026-09-04' })),
    ...['a', 'b'].map((n) => ({ participant_name: n, date: '2026-09-05' })),
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

test('buildMonthGrid kommt mit Monaten klar, die an einem Montag beginnen', () => {
  // 1. Juni 2026 ist ein Montag -> kein Vorlauf.
  const cells = buildMonthGrid(2026, 6);

  assert.equal(cells[0].iso, '2026-06-01');
  assert.equal(cells[0].inCurrentMonth, true);
});

test('buildMonthGrid berücksichtigt Schaltjahre', () => {
  const cells = buildMonthGrid(2028, 2);
  assert.equal(cells.filter((cell) => cell.inCurrentMonth).length, 29);
});

test('shiftMonth rechnet über Jahresgrenzen hinweg', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 9, 0), { year: 2026, month: 9 });
});

test('ownDates findet die eigenen Tage unabhängig von Groß-/Kleinschreibung', () => {
  assert.deepEqual([...ownDates(entries, 'anna')].sort(), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.deepEqual([...ownDates(entries, '  BEN  ')].sort(), ['2026-09-01', '2026-09-02']);
  assert.deepEqual([...ownDates(entries, '')], []);
});

test('withOwnSelection ersetzt die eigenen Einträge, fremde bleiben unangetastet', () => {
  const result = withOwnSelection(entries, 'Anna', ['2026-09-10']);

  assert.deepEqual([...ownDates(result, 'Anna')], ['2026-09-10']);
  assert.deepEqual([...ownDates(result, 'Ben')].sort(), ['2026-09-01', '2026-09-02']);
  assert.equal(result.filter((e) => e.participant_name === 'Anna').length, 1);
});

test('withOwnSelection lässt ohne Namen alles unverändert', () => {
  assert.deepEqual(withOwnSelection(entries, '   ', ['2026-09-10']), entries);
});

test('withOwnSelection kann eine Person komplett austragen', () => {
  const result = withOwnSelection(entries, 'Anna', []);

  assert.deepEqual([...ownDates(result, 'Anna')], []);
  assert.equal(rankDays(result).find((day) => day.date === '2026-09-03'), undefined);
});
