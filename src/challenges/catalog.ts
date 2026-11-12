import { restLabel } from './plan-view';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { capitalise } from '@/lib/text';

import { expand, goalLabel, type Challenge } from '@/workout/plan/plan';
import { scheduleLabel } from '@/workout/plan/schedule';

/** One line on a challenge card: the step's goal in its own unit ("×25", "60S", "MAX"). */
export type CatalogStep = { exercise: ExerciseId; name: string; goal: string };
export type CatalogEntry = {
  /** The route id: a suggested challenge or one you made. */
  id: string;
  name: string;
  days: number;
  schedule?: string;
  /** One-off cards lead with their workload instead of a bare 1 DAY. */
  workload?: { amount: number; unit: string };
  steps: readonly CatalogStep[];
  /** Rounds and rest: not steps you do, so one label under the lines. */
  note?: string;
};

/** A challenge as its card shows it: each exercise step once, rounds and rest folded into the note. */
export function toEntry(id: string, { name, days, session, schedule }: Challenge): CatalogEntry {
  const steps: CatalogStep[] = [];
  const note: string[] = [];
  for (const block of session) {
    if (block.rounds > 1) note.push(`${block.rounds} ROUNDS`);
    for (const { exercise, goal } of block.steps) {
      if (exercise === 'rest') {
        note.push(restLabel(goal));
        continue;
      }
      steps.push({ exercise, name: capitalise(EXERCISES[exercise].name), goal: goalLabel(goal) });
    }
  }
  const sets = days === 1 ? expand(session).filter((step) => step.exercise !== 'rest') : [];
  const repsOnly = sets.every((step) => step.goal.type === 'reps');
  const workload =
    sets.length > 0
      ? {
          amount: repsOnly
            ? sets.reduce((sum, step) => sum + (step.goal.type === 'reps' ? step.goal.n : 0), 0)
            : sets.length,
          unit: repsOnly ? 'REPS' : sets.length === 1 ? 'SET' : 'SETS',
        }
      : undefined;
  return {
    id,
    name,
    days,
    ...(schedule && { schedule: scheduleLabel({ days, schedule }) }),
    ...(workload && { workload }),
    steps,
    // A ladder rests after every rung; the note says so once.
    ...(note.length > 0 && { note: [...new Set(note)].join(' · ') }),
  };
}
