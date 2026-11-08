import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import type { FlatSteps, Goal } from './plan';

/** `cue`: the first form cue, if any. */
export type Attempt = { counted: boolean; depth: number; cue: string | null };
export type StepResult = {
  exercise: ExerciseId;
  round: number;
  /** Wall-clock timestamps, separate from the detector clock used for reps and holds. */
  startedAt: number;
  endedAt: number;
  goal: Goal;
  reps: number;
  noReps: number;
  heldMs: number;
  attempts: readonly Attempt[];
  /**
   * The set's video files, in order (a pause starts a new one); none when it wasn't filmed.
   * shortcut: they live in Paths.cache/reps until the session stops, then move to Paths.document/videos
   * (or are deleted); a result kept past the session must follow its files there.
   */
  takes: readonly string[];
  // shortcut: stats is a formatted string; keep the numbers when results persist.
  stats: string | null;
};

/** How much of its goal one set did, 0 to 1; an open-ended set counts in full once anything was done. */
export const setShare = (goal: Goal, amount: number) =>
  goal.type === 'max' ? (amount > 0 ? 1 : 0) : Math.min(1, amount / goal.n);

/**
 * What each exercise set got, in session order: reps, or seconds held (not rounded: half a second still
 * meets a MAX goal). A set never reached is 0, so there is one number per exercise step.
 */
export function setAmounts(steps: FlatSteps, results: readonly StepResult[]) {
  return steps
    .filter((step) => step.exercise !== 'rest')
    .map((_, i) => {
      const set = results.at(i);
      if (!set) return 0;
      return EXERCISES[set.exercise].kind === 'hold' ? set.heldMs / 1000 : set.reps;
    });
}

/**
 * How much of the day's session was done, 0 to 1: each exercise set's share of its goal, averaged over
 * every set, so one skipped or never reached is 0. 1 means every goal was met.
 */
export function shareDone(steps: FlatSteps, results: readonly StepResult[]) {
  const sets = steps.filter((step) => step.exercise !== 'rest');
  const amounts = setAmounts(steps, results);
  return sets.reduce((sum, { goal }, i) => sum + setShare(goal, amounts[i]), 0) / sets.length;
}
