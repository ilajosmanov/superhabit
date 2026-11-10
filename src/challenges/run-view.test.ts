import { expect, it } from 'vite-plus/test';

import { dayWord, linkedDay, percent } from './run-view';

it('says each day of a run in a word', () => {
  const run = { id: 'r', day: 4, days: 14, from: '2026-11-01', progress: [1, 0, 0.999, 0] };
  expect([0, 1, 2, 3, 4, 6].map((i) => dayWord(run, i))).toEqual([
    'DONE',
    'MISSED',
    '99%',
    'NOT YET',
    'IN 1 DAY',
    'IN 3 DAYS',
  ]);
});

it('says a share as a whole percent, rounded down but not by float error', () => {
  expect([0.57, 0.29, 0.999, 1].map(percent)).toEqual(['57%', '29%', '99%', '100%']);
});

it('opens a linked date on its day of the current stretch, else on today', () => {
  // Restarted on 11-03, now on day 4 (11-06).
  const run = { id: 'r', day: 4, days: 14, from: '2026-11-03', progress: [1, 1, 1, 0] };
  expect(linkedDay(run, '2026-11-04')).toBe(1);
  expect(linkedDay(run, '2026-11-06')).toBeNull();
  expect(linkedDay(run, '2026-11-02')).toBeNull();
  expect(linkedDay(run, 'yesterday')).toBeNull();
  expect(linkedDay(run, '2026-11-31')).toBeNull();
  expect(linkedDay(run, undefined)).toBeNull();
});
