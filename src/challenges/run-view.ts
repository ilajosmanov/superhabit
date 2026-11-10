import { addDays, daysBetween, type Day } from '@/workout/plan/day';

/**
 * A run on `today` as screens show it: `from` is its day 1 (later than the join day after a restart),
 * `progress` one share per day from then through today.
 */
export type RunView = {
  id: string;
  day: number;
  days: number;
  from: Day;
  progress: readonly number[];
};

export const doneToday = (run: RunView) => run.progress[run.day - 1] >= 1;

/** A share as the page says it, rounded down so a day just short of done never reads 100%. */
// The epsilon undoes float error: 57 of 100 is 0.57, and 0.57 * 100 is 56.99999999999999.
export const percent = (share: number) => `${Math.floor(share * 100 + 1e-9)}%`;

/**
 * Day `i` of a run (0 is day 1) in a word: DONE, how much of it (64%), NOT YET for today, MISSED before
 * it, IN 3 DAYS after it.
 */
export function dayWord(run: RunView, i: number) {
  const ahead = i - (run.day - 1);
  if (ahead > 0) return `IN ${ahead} ${ahead === 1 ? 'DAY' : 'DAYS'}`;
  const share = run.progress[i];
  if (share >= 1) return 'DONE';
  if (share > 0) return percent(share);
  return ahead === 0 ? 'NOT YET' : 'MISSED';
}

/**
 * The day of `run` a link names by date (`YYYY-MM-DD`), as an index: null for today, a date outside the
 * run's current stretch, or anything that isn't a date.
 */
export function linkedDay(run: RunView, date: string | undefined): number | null {
  // The round trip turns away a date that isn't one (2026-02-30 would read as March 2).
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || addDays(date, 0) !== date) return null;
  const i = daysBetween(run.from, date);
  return i >= 0 && i < run.day - 1 ? i : null;
}
