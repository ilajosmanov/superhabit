import { COUNTER_VERSIONS, EXERCISES, type Counters, type ExerciseId } from '@/exercises/registry';
import type { LoggedSet } from './logged-set';
import type { FlatSteps, Goal } from './plan';

/** `cue`: the first form cue, if any. */
export type Attempt = {
  /** Detector-clock timestamps, not Unix time. */
  startMs: number;
  bottomMs: number | null;
  endMs: number;
  counted: boolean;
  depth: number | null;
  cue: string | null;
};
/** A finished exercise set, including everything needed for a sets row. */
export type StepResult = {
  id: string;
  workoutId: string;
  /** Index into expand(session), including rest steps. */
  planStep: number;
  counterVersion: string;
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
   * Stable URIs in documents/<user>/videos/<setId>-<take>.mp4. Failed files are omitted here, but
   * keep their indices in the trace header; Discard deletes these alongside the trace.
   */
  takes: readonly string[];
  // shortcut: stats is a formatted string; keep the numbers when results persist.
  stats: string | null;
};

/** Done workouts with a counted rep or hold; an empty Done does not count. */
export function countedWorkouts<T extends { id: string; status: string }>(
  workouts: readonly T[],
  sets: ReadonlyMap<string, readonly Pick<LoggedSet, 'reps' | 'heldMs'>[]>,
): T[] {
  return workouts.filter(
    (workout) =>
      workout.status === 'done' &&
      sets.get(workout.id)?.some(({ reps, heldMs }) => reps > 0 || heldMs > 0),
  );
}

/** Metrics and cues of the last rep, or null before the first rep. */
export function statsOf<K extends ExerciseId>(c: Counters, id: K) {
  const metrics = EXERCISES[id].stats(c[id]);
  const cues = c[id].lastRep?.cues ?? [];
  return metrics && (cues.length ? `${metrics} · ${cues.join(', ')}` : metrics);
}

/** Capture the finished set before the session advances or clears its counters. */
export function finishSet(
  c: Counters,
  set: Pick<
    StepResult,
    | 'id'
    | 'workoutId'
    | 'planStep'
    | 'exercise'
    | 'round'
    | 'startedAt'
    | 'goal'
    | 'attempts'
    | 'takes'
  >,
): StepResult {
  const { exercise } = set;
  const { reps, noReps, heldMs } = c[exercise];
  return {
    ...set,
    counterVersion: COUNTER_VERSIONS[exercise],
    endedAt: Date.now(),
    reps,
    noReps,
    heldMs,
    stats: statsOf(c, exercise),
  };
}

type SetAmount = Pick<StepResult, 'exercise' | 'reps' | 'heldMs'>;

/** How much of its goal one set did, 0 to 1; an open-ended set counts in full once anything was done. */
export const setShare = (goal: Goal, amount: number) =>
  goal.type === 'max' ? (amount > 0 ? 1 : 0) : Math.min(1, amount / goal.n);

/**
 * What each exercise set got, in session order: reps, or seconds held (not rounded: half a second still
 * meets a MAX goal). A set never reached is 0, so there is one number per exercise step.
 */
export function setAmounts(steps: FlatSteps, results: readonly SetAmount[]) {
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
export function shareDone(steps: FlatSteps, results: readonly SetAmount[]) {
  const sets = steps.filter((step) => step.exercise !== 'rest');
  const amounts = setAmounts(steps, results);
  return sets.reduce((sum, { goal }, i) => sum + setShare(goal, amounts[i]), 0) / sets.length;
}

/** One workout's kept sets in plan order; an exercise step with no set got nothing. */
export function workoutResults(steps: FlatSteps, sets: readonly LoggedSet[]) {
  // planStep includes rests. Index once, preserving gaps and the first matching recorded set.
  const byStep = new Map<number, LoggedSet>();
  for (const set of sets) {
    if (steps[set.planStep]?.exercise === set.exercise && !byStep.has(set.planStep))
      byStep.set(set.planStep, set);
  }
  return steps.flatMap((step, planStep) => {
    if (step.exercise === 'rest') return [];
    const set = byStep.get(planStep);
    return [{ exercise: step.exercise, reps: set?.reps ?? 0, heldMs: set?.heldMs ?? 0 }];
  });
}
