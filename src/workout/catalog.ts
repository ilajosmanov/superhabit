import { EXERCISES } from '@/exercises/registry';

import { capitalise, CHALLENGES } from './challenges';
import type { Challenge } from './plan';

/** One line on a challenge card: the step's goal in its own unit ("×25", "60 s", "MAX"). */
export type CatalogStep = { glyph: string; name: string; goal: string };
export type CatalogEntry = {
  /** The CHALLENGES route id. */
  id: string;
  name: string;
  days: number;
  steps: readonly CatalogStep[];
  /** Rounds and rest: not steps you do, so one label under the lines. */
  note?: string;
  /** Some step's counting is still an experiment. */
  experimental: boolean;
};

/** A challenge as its card shows it: each exercise step once, rounds and rest folded into the note. */
export function toEntry(id: string, { name, days, session }: Challenge): CatalogEntry {
  const steps: CatalogStep[] = [];
  const note: string[] = [];
  let experimental = false;
  for (const block of session) {
    if (block.rounds > 1) note.push(`${block.rounds} ROUNDS`);
    for (const { exercise, goal } of block.steps) {
      if (exercise === 'rest') {
        note.push(goal.type === 'seconds' ? `${goal.n} S REST` : 'REST');
        continue;
      }
      const { glyph, name: exerciseName } = EXERCISES[exercise];
      experimental ||= EXERCISES[exercise].experimental === true;
      const text =
        goal.type === 'reps' ? `×${goal.n}` : goal.type === 'seconds' ? `${goal.n} s` : 'MAX';
      steps.push({ glyph, name: capitalise(exerciseName), goal: text });
    }
  }
  return {
    id,
    name,
    days,
    steps,
    experimental,
    ...(note.length > 0 && { note: note.join(' · ') }),
  };
}

// One-day tests are offered by the camera test card, not the catalog.
export const CATALOG: readonly CatalogEntry[] = [...CHALLENGES]
  .filter(([, challenge]) => challenge.days > 1)
  .map(([id, challenge]) => toEntry(id, challenge));

export const catalogEntry = (id: string) => CATALOG.find((entry) => entry.id === id);
