import { expect, it } from 'vite-plus/test';

import { dayWord, percent } from './run-view';

it('labels past, present and future scheduled recovery without calling it missed or done', () => {
  const run = {
    id: 'r',
    day: 2,
    days: 3,
    from: '2026-11-01',
    progress: [0, 0],
    restDays: [0, 1, 2],
  };
  expect([0, 1, 2].map((i) => dayWord(run, i))).toEqual(['REST DAY', 'REST DAY', 'REST DAY']);
});

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
