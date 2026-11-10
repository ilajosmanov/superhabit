import { describe, expect, it } from 'vite-plus/test';

import { detail, plan } from './challenges';
import { defineChallenge, MAX, reps, seconds, type Session } from '@/workout/plan/plan';

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

describe('detail', () => {
  it('says how the camera tracks reps, holds, or both', () => {
    const squats = challenge([{ steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 }]);
    const plank = challenge([{ steps: [{ exercise: 'plank', goal: seconds(60) }], rounds: 1 }]);
    expect([squats, plank, circuit].map((c) => detail(c).tracking)).toEqual([
      'The camera counts. Only full-range reps score.',
      'The camera times your hold. Stay in position to keep the clock running.',
      'The camera counts full-range reps and times your holds.',
    ]);
  });

  it('lists every exercise set in session order, leaving rests out', () => {
    expect(detail(circuit).sets.map((set) => set.exercise)).toEqual([
      'pushup',
      'plank',
      'pushup',
      'plank',
      'pushup',
      'plank',
    ]);
  });
});

describe('plan', () => {
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
    const { parts, single } = plan(tenFifteen);
    expect(parts).toEqual([
      {
        label: 'PART 1 · 5 ROUNDS · 30 S REST BETWEEN',
        rounds: 5,
        rows: [{ exercise: 'pushup', goal: reps(10), move: 'Turn the phone sideways' }],
      },
      {
        label: 'PART 2 · 5 ROUNDS · 30 S REST BETWEEN',
        rounds: 5,
        rows: [{ exercise: 'squat', goal: reps(15), move: 'Then stand the phone upright' }],
      },
    ]);
    expect(single).toBeNull();
  });

  it('keeps one phone line while the phone stays put', () => {
    const { parts, exercises } = plan(circuit);
    expect(parts).toEqual([
      {
        label: '3 ROUNDS · 30 S REST BETWEEN',
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
    expect(plan(fifty).single).toEqual({
      exercise: 'pushup',
      goal: reps(50),
      move: 'Turn the phone sideways',
    });
    const twice = challenge([{ steps: [{ exercise: 'pushup', goal: reps(50) }], rounds: 2 }]);
    expect(plan(twice).single).toBeNull();
  });
});
