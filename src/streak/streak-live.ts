import { aliveDays, streak } from './streak';
import { useLibrary } from '@/challenges/library-live';
import { restDays } from '@/challenges/rest-days';
import type { Day } from '@/lib/day';

/** Your streak on `today`, from the shared snapshot. */
export function useStreak(today: Day) {
  const library = useLibrary();
  return streak(
    aliveDays(library.workouts, library.sets),
    today,
    undefined,
    restDays(library, today),
  );
}
