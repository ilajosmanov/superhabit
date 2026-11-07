import { EXERCISES } from '@/exercises/registry';

import { capitalise, CHALLENGES } from './challenges';
import { goalLabel, type Challenge } from '@/workout/plan';

/** One line on a challenge card: the step's goal in its own unit ("×25", "60 s", "MAX"). */
type CatalogStep = { glyph: string; name: string; goal: string };
export type CatalogEntry = {
  /** The CHALLENGES route id. */
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
        note.push(goal.type === 'seconds' ? `${goal.n}S REST` : 'REST');
        continue;
      }
      const { glyph, name: exerciseName } = EXERCISES[exercise];
      steps.push({ glyph, name: capitalise(exerciseName), goal: goalLabel(goal) });
    }
  }
  return {
    id,
    name,
    days,
    steps,
    ...(note.length > 0 && { note: note.join(' · ') }),
  };
}

export const CATALOG: readonly CatalogEntry[] = [...CHALLENGES].map(([id, challenge]) =>
  toEntry(id, challenge),
);

export const catalogEntry = (id: string) => CATALOG.find((entry) => entry.id === id);
