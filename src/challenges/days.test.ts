import { describe, expect, it } from 'vite-plus/test';

import { dayLabel, runOn, today } from './days';

describe('runOn', () => {
  const days = (...d: number[]) => d.map((n) => `2026-11-0${n}`);
  const missedThird = days(1, 2, 4, 5);

  it('leaves a missed day empty when restart is off', () => {
    expect(
      runOn({ days: 21, restartOnMiss: false }, '2026-11-01', days(1, 3), '2026-11-03'),
    ).toEqual({ day: 3, days: 21, from: '2026-11-01', done: [true, false, true] });
  });

  it('restarts the day after a miss, flagging only the new run', () => {
    expect(
      runOn({ days: 30, restartOnMiss: true }, '2026-11-01', missedThird, '2026-11-06'),
    ).toEqual({ day: 3, days: 30, from: '2026-11-04', done: [true, true, false] });
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
    expect(runOn({ days: 30, restartOnMiss: false }, '2026-03-27', [], '2026-03-31')).toMatchObject(
      { day: 5, from: '2026-03-27' },
    );
  });

  it('starts at day one and does not treat today as missed', () => {
    expect(runOn({ days: 1, restartOnMiss: true }, '2026-11-01', [], '2026-11-01')).toEqual({
      day: 1,
      days: 1,
      from: '2026-11-01',
      done: [false],
    });
  });

  it('restarts again on consecutive misses, including across a month boundary', () => {
    expect(runOn({ days: 3, restartOnMiss: true }, '2026-10-30', [], '2026-11-02')).toMatchObject({
      day: 1,
      from: '2026-11-02',
    });
  });

  it('is null before the start date', () => {
    expect(runOn({ days: 30, restartOnMiss: false }, '2026-11-01', [], '2026-10-31')).toBeNull();
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
