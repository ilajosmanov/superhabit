import { EXERCISES, type ExerciseId } from '@/exercises/registry';

import {
  MAX,
  readPlan,
  reps,
  seconds,
  type Block,
  type ExerciseStep,
  type Session,
  type Step,
} from './plan';

type Exercises = readonly [ExerciseStep, ...ExerciseStep[]];
type Rungs = readonly [number, ...number[]];

/** A counted set, or a timed hold. Numbers use the exercise's unit; Max is open-ended. */
export function exerciseSet(exercise: ExerciseId, amount: number | 'max'): ExerciseStep {
  return {
    exercise,
    goal:
      amount === 'max' ? MAX : EXERCISES[exercise].kind === 'hold' ? seconds(amount) : reps(amount),
  };
}

function restDuration(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('rest must be a whole number of seconds >= 0');
  }
}

const rest = (n: number): Step => ({ exercise: 'rest', goal: seconds(n) });

/** Keep authored plans on the same contract as stored plans. Never end a workout with a rest. */
function finish(blocks: readonly Block[]): Session {
  const last = blocks.at(-1);
  const normalized =
    last?.rounds === 1 && last.steps.at(-1)?.exercise === 'rest'
      ? [...blocks.slice(0, -1), { ...last, steps: last.steps.slice(0, -1) }]
      : blocks;
  const result = readPlan(normalized);
  if (!result) throw new Error('invalid workout structure');
  return result;
}

function round(exercises: Exercises, between: number, after: number): Block['steps'] {
  restDuration(between);
  restDuration(after);
  const [first, ...remaining] = exercises;
  return [
    first,
    ...remaining.flatMap((step) => (between > 0 ? [rest(between), step] : [step])),
    ...(after > 0 ? [rest(after)] : []),
  ];
}

/** Repeat the exercises in order. Rest between exercises and rest between rounds are independent. */
export function circuit({
  exercises,
  rounds = 1,
  restBetweenExercises = 0,
  restBetweenRounds = 0,
}: {
  exercises: Exercises;
  rounds?: number;
  restBetweenExercises?: number;
  restBetweenRounds?: number;
}): Session {
  return finish([{ steps: round(exercises, restBetweenExercises, restBetweenRounds), rounds }]);
}

/** One exercise repeated, with optional rest between sets. */
export function sets({
  exercise,
  rounds = 1,
  restBetweenSets = 0,
}: {
  exercise: ExerciseStep;
  rounds?: number;
  restBetweenSets?: number;
}): Session {
  return circuit({ exercises: [exercise], rounds, restBetweenRounds: restBetweenSets });
}

/**
 * Explicit rungs cover ascending/descending ladders and 21–15–9. The callback can give each exercise
 * its own target, e.g. push-ups at n and squats at 11 - n. Each rung runs exactly once.
 */
export function ladder({
  rungs,
  exercises,
  restBetweenExercises = 0,
  restBetweenRungs = 0,
}: {
  rungs: Rungs;
  exercises: (rung: number, index: number) => Exercises;
  restBetweenExercises?: number;
  restBetweenRungs?: number;
}): Session {
  if (rungs.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    throw new Error('ladder rungs must be positive whole numbers');
  }
  return finish(
    rungs.map((n, i) => ({
      steps: round(exercises(n, i), restBetweenExercises, restBetweenRungs),
      rounds: 1,
    })),
  );
}

/** Join authored parts in order. A repeated part keeps its closing rest before the following part. */
export function session(...parts: readonly [Session, ...Session[]]): Session {
  return finish(parts.flat());
}
