import { expect, it } from 'vite-plus/test';

import { addDays, dayLabel, today } from './day';

it('takes today from the local calendar, not UTC, turning only at local midnight', () => {
  // 00:30 in Tallinn (the test zone) is still 6 Nov in UTC.
  expect(today(new Date(2026, 10, 7, 0, 30))).toBe('2026-11-07');
  expect(today(new Date(2026, 10, 7, 23, 59, 59, 999))).toBe('2026-11-07');
  expect(today(new Date(2026, 10, 8, 0, 0))).toBe('2026-11-08');
});

it('labels a day as weekday, date and month', () => {
  expect(dayLabel('2026-11-07')).toBe('SAT 7 NOV');
  expect(dayLabel('2026-03-01')).toBe('SUN 1 MAR');
});

it('adds calendar days across spring and autumn DST changes, in either direction', () => {
  expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
  expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  expect(addDays('2026-03-30', -2)).toBe('2026-03-28');
  expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  expect(addDays('2026-10-26', -1)).toBe('2026-10-25');
});
