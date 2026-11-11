import { isExerciseId, type ExerciseId } from '@/exercises/registry';
import type * as schema from '@/storage/schema';
import { readGoal, type Goal } from './plan';

/** A finished set as it is kept: what it got toward which step of the plan. */
export type LoggedSet = {
  id: string;
  workoutId: string;
  planStep: number;
  exercise: ExerciseId;
  goal: Goal;
  reps: number;
  heldMs: number;
  /** Wall-clock ms. */
  startedAt: number;
  endedAt: number;
};

/** Stored set rows this app can read; a set of an exercise it doesn't know (a newer app's) is left out. */
export function readSets(
  rows: readonly Omit<typeof schema.sets.$inferSelect, 'attempts' | 'metrics' | 'counterVersion'>[],
): LoggedSet[] {
  return rows.flatMap((set) => {
    const goal = readGoal(set.goal);
    return isExerciseId(set.exercise) && goal ? [{ ...set, exercise: set.exercise, goal }] : [];
  });
}
