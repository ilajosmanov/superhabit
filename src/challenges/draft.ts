import { EXERCISES, type ExerciseId } from '@/exercises/registry';

import { capitalise } from './challenges';
import { defineChallenge, MAX, reps, seconds, type Challenge, type Goal } from '@/workout/plan';

/** What the builder edits: one exercise and its daily goal. `name` is null until you type one. */
export type Draft = {
  exercise: ExerciseId;
  goal: Goal;
  days: number;
  restartOnMiss: boolean;
  name: string | null;
};

/** The slider's stops: reps in fives, holds in tens of seconds; one stop past `max` is Max. */
export const RANGE = {
  reps: { min: 5, max: 150, step: 5 },
  seconds: { min: 10, max: 300, step: 10 },
} as const;
export const DAY_CHOICES = [7, 14, 21, 30] as const;

const isHold = (exercise: ExerciseId) => EXERCISES[exercise].kind === 'hold';

/** The exercise's slider unit. */
export const unitOf = (exercise: ExerciseId) => (isHold(exercise) ? 'seconds' : 'reps');

/** Set the slider's number in the exercise's own unit; past the range's top it is Max. */
export const withAmount = (draft: Draft, n: number): Draft => {
  const unit = unitOf(draft.exercise);
  return {
    ...draft,
    goal: n > RANGE[unit].max ? MAX : unit === 'seconds' ? seconds(n) : reps(n),
  };
};

/** Set a typed number in the exercise's own unit: any whole number from 1, in or past the slider's range. */
export const withNumber = (draft: Draft, n: number): Draft => ({
  ...draft,
  goal: isHold(draft.exercise) ? seconds(n) : reps(n),
});

export const newDraft = (exercise: ExerciseId) =>
  withAmount(
    { exercise, goal: MAX, days: 21, restartOnMiss: false, name: null },
    isHold(exercise) ? 60 : 20,
  );

// shortcut: the builder edits one exercise only, so a challenge with rounds or several steps has no Edit;
// teach the builder steps when made challenges need them.
/** A one-exercise challenge as a draft; null for anything longer, which the builder can't show. */
export function draftOf({ name, days, restartOnMiss, session }: Challenge): Draft | null {
  const [block, ...more] = session;
  const [step, ...others] = block.steps;
  if (more.length > 0 || others.length > 0 || block.rounds !== 1 || step.exercise === 'rest') {
    return null;
  }
  return { exercise: step.exercise, goal: step.goal, days, restartOnMiss, name };
}

/** The name until you type one: the exercise ("Push-ups"); the number stays out so the field holds still. */
export const autoName = ({ exercise }: Pick<Draft, 'exercise'>) =>
  capitalise(EXERCISES[exercise].name);

export const toChallenge = (draft: Draft): Challenge =>
  defineChallenge({
    name: draft.name?.trim() || autoName(draft),
    days: draft.days,
    restartOnMiss: draft.restartOnMiss,
    session: [{ steps: [{ exercise: draft.exercise, goal: draft.goal }], rounds: 1 }],
  });
