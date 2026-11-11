import { aliveDays, streak } from './streak';
import { useLibrary } from '@/challenges/library-live';
import type { Day } from '@/lib/day';

/** Your streak on `today`, from the shared snapshot. */
export function useStreak(today: Day) {
  const { workouts, sets } = useLibrary();
  return streak(aliveDays(workouts, sets), today);
}
