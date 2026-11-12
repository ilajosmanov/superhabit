import { restLabel } from './plan-view';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { capitalise } from '@/lib/text';

import { goalLabel, type Challenge } from '@/workout/plan/plan';

/** One line on a challenge card: the step's goal in its own unit ("×25", "60S", "MAX"). */
export type CatalogStep = { exercise: ExerciseId; name: string; goal: string };
export type CatalogEntry = {
  /** The route id: a suggested challenge or one you made. */
  id: string;
  name: string;
  days: number;
  steps: readonly CatalogStep[];
  /** Rounds and rest: not steps you do, so one label under the lines. */
  note?: string;
};

/** A challenge as its card shows it: each exercise step once, rounds and rest folded into the note. */
export function toEntry(id: string, { name, days, session }: Challenge): CatalogEntry {
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
  return {
    id,
    name,
    days,
    steps,
    // A ladder rests after every rung; the note says so once.
    ...(note.length > 0 && { note: [...new Set(note)].join(' · ') }),
  };
}
