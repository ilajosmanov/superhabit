import { EXERCISES, type ExerciseId } from '@/exercises/registry';

/** One set: count `reps` of `exercise`. `reps: Infinity` = open-ended. */
type Target = { exercise: ExerciseId; reps: number };
/** Non-empty by type, so "current set" always exists. */
export type Challenge = { name: string; sets: readonly [Target, ...Target[]] };

/** Route id -> challenge, in catalog order. Open-ended ones are tests: the camera card offers them, the catalog doesn't. */
export const CHALLENGES: ReadonlyMap<string, Challenge> = new Map([
  [
    'squat-pushup',
    {
      name: '3 squats + 3 push-ups',
      sets: [
        { exercise: 'squat', reps: 3 },
        { exercise: 'pushup', reps: 3 },
      ],
    },
  ],
  ['squat-hundred', { name: 'Squat hundred', sets: [{ exercise: 'squat', reps: 100 }] }],
  ['pushup-fifty', { name: 'Push-up fifty', sets: [{ exercise: 'pushup', reps: 50 }] }],
  ['squat', { name: 'Squat test', sets: [{ exercise: 'squat', reps: Infinity }] }],
  ['pushup', { name: 'Push-up test', sets: [{ exercise: 'pushup', reps: Infinity }] }],
]);

/** "3 squats, then 3 push-ups"; an open-ended set reads "Squats, as many as you can". */
export function summary({ sets }: Challenge): string {
  const text = sets
    .map(({ exercise, reps }) =>
      Number.isFinite(reps)
        ? `${reps} ${EXERCISES[exercise].name}`
        : `${EXERCISES[exercise].name}, as many as you can`,
    )
    .join(', then ');
  return capitalise(text);
}

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Reps across all sets; Infinity when any set is open-ended. */
export const totalReps = ({ sets }: Challenge) => sets.reduce((n, { reps }) => n + reps, 0);
