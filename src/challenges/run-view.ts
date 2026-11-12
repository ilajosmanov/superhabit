import type { Day } from '@/lib/day';

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
  /** Zero-based positions in this run's current calendar stretch. */
  restDays?: readonly number[];
};

export const doneToday = (run: RunView) => run.progress[run.day - 1] >= 1;
export const restingToday = (run: RunView) => run.restDays?.includes(run.day - 1) ?? false;

/** A share as the page says it, rounded down so a day just short of done never reads 100%. */
// The epsilon undoes float error: 57 of 100 is 0.57, and 0.57 * 100 is 56.99999999999999.
export const percent = (share: number) => `${Math.floor(share * 100 + 1e-9)}%`;

/**
 * Day `i` of a run (0 is day 1) in a word: DONE, how much of it (64%), NOT YET for today, MISSED before
 * it, IN 3 DAYS after it.
 */
export function dayWord(run: RunView, i: number) {
  if (run.restDays?.includes(i)) return 'REST DAY';
  const ahead = i - (run.day - 1);
  if (ahead > 0) return `IN ${ahead} ${ahead === 1 ? 'DAY' : 'DAYS'}`;
  const share = run.progress[i];
  if (share >= 1) return 'DONE';
  if (share > 0) return percent(share);
  return ahead === 0 ? 'NOT YET' : 'MISSED';
}
