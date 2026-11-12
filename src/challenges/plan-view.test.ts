import { describe, expect, it } from 'vite-plus/test';

import { planView, trackedSets } from './plan-view';
import { defineChallenge, MAX, reps, seconds, type Session } from '@/workout/plan/plan';
import { circuit as makeCircuit, exerciseSet } from '@/workout/plan/structures';

const challenge = (session: Session) =>
  defineChallenge({ name: 'Test', days: 1, restartOnMiss: false, dailyTotal: false, session });

const circuit = challenge([
  {
    steps: [
      { exercise: 'pushup', goal: reps(10) },
      { exercise: 'plank', goal: seconds(30) },
      { exercise: 'rest', goal: seconds(30) },
    ],
    rounds: 3,
  },
]);

describe('trackedSets', () => {
  it('says how the camera tracks reps, holds, or both', () => {
    const squats = challenge([{ steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 }]);
    const plank = challenge([{ steps: [{ exercise: 'plank', goal: seconds(60) }], rounds: 1 }]);
    expect([squats, plank, circuit].map((c) => trackedSets(c).tracking)).toEqual([
      'The camera counts. Only full-range reps score.',
      'The camera times your hold. Stay in position to keep the clock running.',
      'The camera counts full-range reps and times your holds.',
    ]);
  });

  it('lists every exercise set in session order, leaving rests out', () => {
    expect(trackedSets(circuit).sets.map((set) => set.exercise)).toEqual([
      'pushup',
      'plank',
      'pushup',
      'plank',
      'pushup',
      'plank',
    ]);
  });
});

describe('planView', () => {
  it.each([
    [1, 0, '10 S REST BETWEEN EXERCISES'],
    [2, 60, '2 ROUNDS · 10 S REST BETWEEN EXERCISES · 60 S REST BETWEEN ROUNDS'],
  ] as const)(
    'distinguishes exercise rests from round rests with %s rounds',
    (rounds, restBetweenRounds, label) => {
      const plan = challenge(
        makeCircuit({
          exercises: [exerciseSet('pushup', 15), exerciseSet('plank', 30)],
          rounds,
          restBetweenExercises: 10,
          restBetweenRounds,
        }),
      );
      expect(planView(plan).parts[0].label).toBe(label);
    },
  );

  it('says rounds and rest once a part and puts the phone line where the phone moves', () => {
    const tenFifteen = challenge([
      {
        steps: [
          { exercise: 'pushup', goal: reps(10) },
          { exercise: 'rest', goal: seconds(30) },
        ],
        rounds: 5,
      },
      {
        steps: [
          { exercise: 'squat', goal: reps(15) },
          { exercise: 'rest', goal: seconds(30) },
        ],
        rounds: 5,
      },
    ]);
    const { parts, single } = planView(tenFifteen);
    expect(parts).toEqual([
      {
        label: 'PART 1 · 5 ROUNDS · 30 S REST BETWEEN ROUNDS',
        rounds: 5,
        rows: [{ exercise: 'pushup', goal: reps(10), move: 'Turn the phone sideways' }],
      },
      {
        label: 'PART 2 · 5 ROUNDS · 30 S REST BETWEEN ROUNDS',
        rounds: 5,
        rows: [{ exercise: 'squat', goal: reps(15), move: 'Then stand the phone upright' }],
      },
    ]);
    expect(single).toBeNull();
  });

  it('keeps one phone line while the phone stays put', () => {
    const { parts, exercises } = planView(circuit);
    expect(parts).toEqual([
      {
        label: '3 ROUNDS · 30 S REST BETWEEN ROUNDS',
        rounds: 3,
        rows: [
          { exercise: 'pushup', goal: reps(10), move: 'Turn the phone sideways' },
          { exercise: 'plank', goal: seconds(30) },
        ],
      },
    ]);
    expect(exercises).toEqual(['pushup', 'plank']);
  });

  it('gives a one-exercise, one-round session as a single row', () => {
    const fifty = challenge([{ steps: [{ exercise: 'pushup', goal: reps(50) }], rounds: 1 }]);
    expect(planView(fifty).single).toEqual({
      exercise: 'pushup',
      goal: reps(50),
      move: 'Turn the phone sideways',
    });
    const twice = challenge([{ steps: [{ exercise: 'pushup', goal: reps(50) }], rounds: 2 }]);
    expect(planView(twice).single).toBeNull();
  });
});
