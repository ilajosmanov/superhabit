import { isExerciseId, type ExerciseId } from '@/exercises/registry';
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

/** Parse and group stored sets by workout; an exercise from a newer app is left out. */
export function readSets(
  rows: readonly (Omit<LoggedSet, 'exercise' | 'goal'> & { exercise: string; goal: unknown })[],
): ReadonlyMap<string, readonly LoggedSet[]> {
  const grouped = new Map<string, LoggedSet[]>();
  for (const set of rows) {
    const goal = readGoal(set.goal);
    if (!isExerciseId(set.exercise) || !goal) continue;
    const group = grouped.get(set.workoutId) ?? [];
    group.push({ ...set, exercise: set.exercise, goal });
    grouped.set(set.workoutId, group);
  }
  return grouped;
}
