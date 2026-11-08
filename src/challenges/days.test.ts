import { describe, expect, it } from 'vite-plus/test';

import { dayLabel, dayWord, percent, runOn, setsOn, today } from './days';

describe('runOn', () => {
  // Each listed day fully done.
  const days = (...d: number[]) => Object.fromEntries(d.map((n) => [`2026-11-0${n}`, 1]));
  const missedThird = days(1, 2, 4, 5);

  it('leaves a missed day empty when restart is off', () => {
    expect(
      runOn({ days: 21, restartOnMiss: false }, '2026-11-01', days(1, 3), '2026-11-03'),
    ).toEqual({ day: 3, days: 21, from: '2026-11-01', progress: [1, 0, 1] });
  });

  it('restarts the day after a miss, flagging only the new run', () => {
    expect(
      runOn({ days: 30, restartOnMiss: true }, '2026-11-01', missedThird, '2026-11-06'),
    ).toEqual({ day: 3, days: 30, from: '2026-11-04', progress: [1, 1, 0] });
  });

  it('keeps the run going on a day with only a partial try', () => {
    const tried = { ...days(1, 2), '2026-11-03': 0.3 };
    expect(runOn({ days: 30, restartOnMiss: true }, '2026-11-01', tried, '2026-11-04')).toEqual({
      day: 4,
      days: 30,
      from: '2026-11-01',
      progress: [1, 1, 0.3, 0],
    });
  });

  it('never restarts a finished run after later missed days', () => {
    expect(
      runOn({ days: 3, restartOnMiss: true }, '2026-11-01', days(1, 2, 3), '2026-11-06'),
    ).toBeNull();
  });

  it('includes the last day but is over on the next', () => {
    const c = { days: 3, restartOnMiss: true };
    expect(runOn(c, '2026-11-01', days(1, 2, 3), '2026-11-03')).toMatchObject({ day: 3 });
    expect(runOn(c, '2026-11-01', days(1, 2, 3), '2026-11-04')).toBeNull();
  });

  it('counts through the spring DST change without losing a day', () => {
    expect(runOn({ days: 30, restartOnMiss: false }, '2026-03-27', {}, '2026-03-31')).toMatchObject(
      { day: 5, from: '2026-03-27' },
    );
  });

  it('starts at day one and does not treat today as missed', () => {
    expect(runOn({ days: 1, restartOnMiss: true }, '2026-11-01', {}, '2026-11-01')).toEqual({
      day: 1,
      days: 1,
      from: '2026-11-01',
      progress: [0],
    });
  });

  it('restarts again on consecutive misses, including across a month boundary', () => {
    expect(runOn({ days: 3, restartOnMiss: true }, '2026-10-30', {}, '2026-11-02')).toMatchObject({
      day: 1,
      from: '2026-11-02',
    });
  });

  it('is null before the start date', () => {
    expect(runOn({ days: 30, restartOnMiss: false }, '2026-11-01', {}, '2026-10-31')).toBeNull();
  });
});

it('takes today from the local calendar, not UTC', () => {
  // 00:30 in Tallinn (the test zone) is still 6 Nov in UTC.
  expect(today(new Date(2026, 10, 7, 0, 30))).toBe('2026-11-07');
});

it('labels a day as weekday, date and month', () => {
  expect(dayLabel('2026-11-07')).toBe('SAT 7 NOV');
  expect(dayLabel('2026-03-01')).toBe('SUN 1 MAR');
});

it('says each day of a run in a word', () => {
  const run = { day: 4, days: 14, from: '2026-11-01', progress: [1, 0, 0.999, 0] };
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

describe('setsOn', () => {
  const run = { day: 3, days: 14, from: '2026-11-01', progress: [0.5, 0, 1] };
  it('gives the kept sets of a tried day, and nothing done on a day with no try', () => {
    const kept = { '2026-11-01': [5, 0], '2026-11-03': [10, 30] };
    expect(setsOn(run, kept, 0, 2)).toEqual([5, 0]);
    expect(setsOn(run, kept, 1, 2)).toEqual([0, 0]);
    expect(setsOn(run, kept, 2, 2)).toEqual([10, 30]);
  });
  it('knows nothing of a day ahead, a day tried before sets were kept, or sets an edit changed', () => {
    // The phone's clock set back can leave sets on a day still ahead.
    expect(setsOn(run, { '2026-11-04': [5, 0] }, 3, 2)).toBeUndefined();
    expect(setsOn(run, {}, 0, 2)).toBeUndefined();
    expect(setsOn(run, { '2026-11-01': [5, 0, 0] }, 0, 2)).toBeUndefined();
  });
});
