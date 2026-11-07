import type { Challenge } from '@/workout/plan';

/** Local YYYY-MM-DD; UTC arithmetic keeps calendar days independent of DST. */
export type Day = string;

const DAY_MS = 86_400_000;
const dayNumber = (day: Day) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;
const dayAt = (n: number): Day => new Date(n * DAY_MS).toISOString().slice(0, 10);

const pad = (n: number) => String(n).padStart(2, '0');
/** The phone's calendar day, not UTC's: a 00:30 workout counts for the day it is where you are. */
export const today = (now = new Date()): Day =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const addDays = (day: Day, n: number) => dayAt(dayNumber(day) + n);

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "SAT 7 NOV", for mono labels. */
export function dayLabel(day: Day) {
  const date = new Date(dayNumber(day) * DAY_MS);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * Where a joined challenge stands on `today`. `from` is this run's day 1 (later than the join day after a
 * restart); `done` has one flag per day of the run so far, day 1 first.
 */
export type Run = { day: number; days: number; from: Day; done: readonly boolean[] };

/** The run on `today`; null before it starts and once it is over. */
export function runOn(
  c: Pick<Challenge, 'days' | 'restartOnMiss'>,
  startedOn: Day,
  doneDays: readonly Day[],
  today: Day,
): Run | null {
  const done = new Set(doneDays);
  let from = dayNumber(startedOn);
  const end = dayNumber(today);
  if (end < from) return null;
  for (let d = from; d < end; d += 1) {
    // Check the run's end before a miss: a finished run must never restart.
    if (d - from >= c.days) return null;
    if (c.restartOnMiss && !done.has(dayAt(d))) from = d + 1;
  }
  const day = end - from + 1;
  if (day > c.days) return null;
  return {
    day,
    days: c.days,
    from: dayAt(from),
    done: Array.from({ length: day }, (_, i) => done.has(dayAt(from + i))),
  };
}

export const doneToday = (run: Run) => run.done[run.day - 1];
