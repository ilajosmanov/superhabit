import { streak } from './streak';
import { useLibrary } from '@/challenges/library-live';
import type { Day } from '@/workout/plan/day';

/**
 * Your streak on `today`, from the shared snapshot. Alive days: done workouts with a counted rep or hold,
 * the rule `aliveDays()` in workout/store.ts reads from the database for the freezes it writes.
 */
export function useStreak(today: Day) {
  const { workouts, sets } = useLibrary();
  const counted = new Set(
    sets.filter(({ reps, heldMs }) => reps > 0 || heldMs > 0).map(({ workoutId }) => workoutId),
  );
  const alive = workouts.filter((w) => w.status === 'done' && counted.has(w.id)).map((w) => w.day);
  return streak(alive, today);
}
