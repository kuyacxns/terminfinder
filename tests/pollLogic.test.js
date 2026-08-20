import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResults, getTopResults } from '../js/pollLogic.js';

const dateOptions = [
  { id: 'a', date: '2026-09-01', proposed_by: null },
  { id: 'b', date: '2026-09-02', proposed_by: null },
  { id: 'c', date: '2026-09-03', proposed_by: null },
  { id: 'd', date: '2026-09-04', proposed_by: null },
  { id: 'e', date: '2026-09-05', proposed_by: null },
];

test('computeResults zählt Stimmen und Namen korrekt', () => {
  const responses = [
    { participant_name: 'Anna', date_option_ids: ['a', 'b'] },
    { participant_name: 'Ben', date_option_ids: ['a'] },
  ];
  const results = computeResults(dateOptions, responses);
  const a = results.find((r) => r.id === 'a');
  const b = results.find((r) => r.id === 'b');

  assert.equal(a.votes, 2);
  assert.deepEqual([...a.voters].sort(), ['Anna', 'Ben']);
  assert.equal(b.votes, 1);
  assert.deepEqual(b.voters, ['Anna']);
});

test('computeResults ignoriert date_option_ids, die nicht zur Umfrage gehören', () => {
  const responses = [{ participant_name: 'Anna', date_option_ids: ['a', 'unbekannt'] }];
  const results = computeResults(dateOptions, responses);
  assert.equal(results.find((r) => r.id === 'a').votes, 1);
});

test('computeResults sortiert absteigend nach Stimmen, bei Gleichstand nach Datum aufsteigend', () => {
  const responses = [
    { participant_name: 'Anna', date_option_ids: ['c'] },
    { participant_name: 'Ben', date_option_ids: ['a'] },
  ];
  const results = computeResults(dateOptions, responses);
  const withVotes = results.filter((r) => r.votes > 0).map((r) => r.id);
  assert.deepEqual(withVotes, ['a', 'c']);
});

test('computeResults vergibt bei Gleichstand denselben Platz (dense ranking)', () => {
  const responses = [
    { participant_name: '1', date_option_ids: ['a', 'b', 'd'] },
    { participant_name: '2', date_option_ids: ['a', 'b', 'e'] },
    { participant_name: '3', date_option_ids: ['a', 'c'] },
    { participant_name: '4', date_option_ids: ['c'] },
  ];
  const results = computeResults(dateOptions, responses);
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  assert.equal(byId.a.votes, 3);
  assert.equal(byId.b.votes, 2);
  assert.equal(byId.c.votes, 2);
  assert.equal(byId.d.votes, 1);
  assert.equal(byId.e.votes, 1);

  assert.equal(byId.a.rank, 1);
  assert.equal(byId.b.rank, 2);
  assert.equal(byId.c.rank, 2);
  assert.equal(byId.d.rank, 3);
  assert.equal(byId.e.rank, 3);
});

test('getTopResults zeigt bei Gleichstand um Platz 3 alle gleichauf liegenden Termine', () => {
  const responses = [
    ...Array.from({ length: 5 }, (_, i) => ({ participant_name: `pa${i}`, date_option_ids: ['a'] })),
    ...Array.from({ length: 4 }, (_, i) => ({ participant_name: `pb${i}`, date_option_ids: ['b'] })),
    ...Array.from({ length: 3 }, (_, i) => ({ participant_name: `pc${i}`, date_option_ids: ['c'] })),
    ...Array.from({ length: 3 }, (_, i) => ({ participant_name: `pd${i}`, date_option_ids: ['d'] })),
    ...Array.from({ length: 2 }, (_, i) => ({ participant_name: `pe${i}`, date_option_ids: ['e'] })),
  ];
  // Stimmen: a=5, b=4, c=3, d=3, e=2 -> Plätze 1,2,3,3,4 -> Top3 = a,b,c,d
  const results = computeResults(dateOptions, responses);
  const top = getTopResults(results, 3);
  assert.deepEqual(top.map((r) => r.id).sort(), ['a', 'b', 'c', 'd']);
});

test('getTopResults liefert leeres Ergebnis, wenn noch niemand abgestimmt hat', () => {
  const results = computeResults(dateOptions, []);
  assert.deepEqual(getTopResults(results, 3), []);
});

test('getTopResults respektiert ein individuelles topN', () => {
  const responses = [
    { participant_name: '1', date_option_ids: ['a'] },
    { participant_name: '2', date_option_ids: ['a'] },
    { participant_name: '3', date_option_ids: ['a'] },
    { participant_name: '4', date_option_ids: ['b'] },
    { participant_name: '5', date_option_ids: ['b'] },
    { participant_name: '6', date_option_ids: ['c'] },
  ];
  // Stimmen: a=3, b=2, c=1 -> eindeutige Plätze 1, 2, 3
  const results = computeResults(dateOptions, responses);
  assert.deepEqual(getTopResults(results, 1).map((r) => r.id), ['a']);
  assert.deepEqual(
    getTopResults(results, 2).map((r) => r.id).sort(),
    ['a', 'b']
  );
});
