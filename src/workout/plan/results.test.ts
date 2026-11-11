import { describe, expect, it } from 'vite-plus/test';

import type { ExerciseId } from '@/exercises/registry';

import { countedWorkouts, setAmounts, shareDone, type StepResult } from './results';
import { expand, MAX, reps, seconds } from './plan';

const set = (exercise: ExerciseId): StepResult => ({
  id: 'set',
  workoutId: 'workout',
  planStep: 0,
  counterVersion: '1.0.0',
  exercise,
  round: 1,
  startedAt: 0,
  endedAt: 1000,
  goal: reps(10),
  reps: 0,
  noReps: 0,
  heldMs: 0,
  attempts: [],
  takes: [],
  stats: null,
});

const steps = expand([
  {
    steps: [
      { exercise: 'squat', goal: reps(10) },
      { exercise: 'rest', goal: seconds(30) },
      { exercise: 'plank', goal: seconds(30) },
      { exercise: 'plank', goal: MAX },
    ],
    rounds: 1,
  },
]);
const squats = (n: number) => ({ ...set('squat'), reps: n });
const plank = (heldMs: number) => ({ ...set('plank'), goal: seconds(30), heldMs });
const longest = (heldMs: number) => ({ ...set('plank'), goal: MAX, heldMs });

describe('shareDone', () => {
  it('is 1 with every exercise set at its goal, rests aside, and never over 1', () => {
    expect(shareDone(steps, [squats(10), plank(30_000), longest(1500)])).toBe(1);
    expect(shareDone(steps, [squats(25), plank(90_000), longest(1500)])).toBe(1);
  });

  it.each([
    ['3 of 10 reps, the rest never reached', [squats(3)], 0.1],
    ['a hold half done', [squats(10), plank(15_000), longest(1500)], 2.5 / 3],
    ['an open-ended set with nothing done', [squats(10), plank(30_000), longest(0)], 2 / 3],
    ['nothing at all', [], 0],
  ])("averages each set's share with %s", (_, results, share) => {
    expect(shareDone(steps, results)).toBeCloseTo(share);
  });
});

it('gives what each exercise set got: reps, seconds held, 0 when never reached', () => {
  expect(setAmounts(steps, [squats(7), plank(12_900)])).toEqual([7, 12.9, 0]);
});

it('counts only done workouts with a positive rep or hold, matching sets by workout id', () => {
  const workouts = [
    { id: 'rep', status: 'done' },
    { id: 'hold', status: 'done' },
    { id: 'empty', status: 'done' },
    { id: 'no-set', status: 'done' },
    { id: 'open', status: 'open' },
  ];
  const sets = [
    { workoutId: 'rep', reps: 1, heldMs: 0 },
    { workoutId: 'hold', reps: 0, heldMs: 1 },
    { workoutId: 'empty', reps: 0, heldMs: 0 },
    { workoutId: 'open', reps: 10, heldMs: 1000 },
    { workoutId: 'discarded', reps: 10, heldMs: 0 },
  ];

  expect(countedWorkouts(workouts, sets).map(({ id }) => id)).toEqual(['rep', 'hold']);
});
