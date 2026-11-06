import { describe, expect, it } from 'vite-plus/test';

import type { Progress } from '@/exercises/registry';

import { defineChallenge, done, expand, MAX, reps, seconds, validate, type Session } from './plan';

const floorCircuit: Session = [
  {
    steps: [
      { exercise: 'pushup', goal: reps(10) },
      { exercise: 'plank', goal: seconds(30) },
      { exercise: 'rest', goal: seconds(30) },
    ],
    rounds: 3,
  },
];

describe('expand', () => {
  it('keeps the last rest of a block when another block follows, with 1-based round metadata', () => {
    const session: Session = [
      {
        steps: [
          { exercise: 'squat', goal: reps(3) },
          { exercise: 'pushup', goal: reps(3) },
          { exercise: 'rest', goal: seconds(30) },
        ],
        rounds: 3,
      },
      { steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 },
    ];
    const before = structuredClone(session);
    const steps = expand(session);
    expect(steps).toHaveLength(10);
    expect(steps.map(({ round }) => round)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 1]);
    expect(steps.map(({ block }) => block)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(steps.map(({ rounds }) => rounds)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 1]);
    expect(steps.map(({ exercise }) => exercise)).toEqual([
      'squat',
      'pushup',
      'rest',
      'squat',
      'pushup',
      'rest',
      'squat',
      'pushup',
      'rest',
      'squat',
    ]);
    expect(steps[8]?.goal).toEqual({ type: 'seconds', n: 30 });
    expect(steps[9]?.goal).toEqual({ type: 'max' });
    expect(session).toEqual(before);
  });

  it.each([seconds(30), MAX])('drops only the very last rest, including $type rests', (goal) => {
    expect(
      expand([
        {
          steps: [
            { exercise: 'pushup', goal: reps(10) },
            { exercise: 'rest', goal },
          ],
          rounds: 2,
        },
      ]),
    ).toEqual([
      { exercise: 'pushup', goal: { type: 'reps', n: 10 }, block: 1, round: 1, rounds: 2 },
      { exercise: 'rest', goal, block: 1, round: 1, rounds: 2 },
      { exercise: 'pushup', goal: { type: 'reps', n: 10 }, block: 1, round: 2, rounds: 2 },
    ]);
  });

  it('throws instead of expanding an invalid plan', () => {
    expect(() =>
      expand([{ steps: [{ exercise: 'squat', goal: seconds(10) }], rounds: 1 }]),
    ).toThrow('block 1 step 1: squat takes reps or max, not seconds');
  });
});

describe('validate', () => {
  it('rejects exercise-goal mismatches and reports their locations', () => {
    expect(
      validate([
        {
          steps: [
            { exercise: 'squat', goal: seconds(10) },
            { exercise: 'plank', goal: reps(3) },
          ],
          rounds: 1,
        },
      ]),
    ).toEqual([
      'block 1 step 1: squat takes reps or max, not seconds',
      'block 1 step 2: plank takes seconds or max, not reps',
    ]);
  });

  it.each([0, -1, 1.5, Infinity, NaN])('rejects %s rounds', (rounds) => {
    expect(validate([{ steps: [{ exercise: 'squat', goal: reps(3) }], rounds }])).toContain(
      'block 1: rounds must be an integer >= 1',
    );
  });

  it.each([0, -1, 1.5, Infinity, NaN])('rejects %s as a rep or second target', (n) => {
    expect(
      validate([
        {
          steps: [
            { exercise: 'squat', goal: reps(n) },
            { exercise: 'plank', goal: seconds(n) },
            { exercise: 'rest', goal: seconds(n) },
          ],
          rounds: 1,
        },
      ]),
    ).toEqual([
      'block 1 step 1: reps must be an integer >= 1',
      'block 1 step 2: seconds must be an integer >= 1',
      'block 1 step 3: seconds must be an integer >= 1',
    ]);
  });

  it('rejects a leading rest even when expansion would drop it', () => {
    const session: Session = [{ steps: [{ exercise: 'rest', goal: seconds(30) }], rounds: 1 }];
    expect(validate(session)).toContain('session must start with an exercise, not rest');
    expect(() => expand(session)).toThrow('session must start with an exercise, not rest');
  });

  it('rejects adjacent rests before dropping the final rest', () => {
    expect(
      validate([
        {
          steps: [
            { exercise: 'squat', goal: reps(3) },
            { exercise: 'rest', goal: seconds(30) },
            { exercise: 'rest', goal: MAX },
          ],
          rounds: 1,
        },
      ]),
    ).toContain('block 1 round 1: two rests in a row');
  });

  it('rejects adjacent rests at a block boundary', () => {
    expect(
      validate([
        {
          steps: [
            { exercise: 'squat', goal: reps(3) },
            { exercise: 'rest', goal: seconds(30) },
          ],
          rounds: 1,
        },
        {
          steps: [
            { exercise: 'rest', goal: MAX },
            { exercise: 'pushup', goal: reps(3) },
          ],
          rounds: 1,
        },
      ]),
    ).toEqual(['block 2 round 1: two rests in a row']);
  });

  it('rejects adjacent rests between rounds', () => {
    expect(
      validate([
        { steps: [{ exercise: 'squat', goal: reps(3) }], rounds: 1 },
        {
          steps: [
            { exercise: 'rest', goal: seconds(30) },
            { exercise: 'pushup', goal: reps(3) },
            { exercise: 'rest', goal: seconds(30) },
          ],
          rounds: 2,
        },
      ]),
    ).toEqual(['block 2 round 2: two rests in a row']);
  });

  it('accepts the floor circuit and max goals on rep and hold kinds', () => {
    expect(validate(floorCircuit)).toEqual([]);
    expect(
      validate([
        {
          steps: [
            { exercise: 'squat', goal: MAX },
            { exercise: 'pushup', goal: MAX },
            { exercise: 'plank', goal: MAX },
            { exercise: 'rest', goal: MAX },
          ],
          rounds: 1,
        },
      ]),
    ).toEqual([]);
  });
});

describe('done', () => {
  const progress: Progress = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    lastRep: null,
  };

  it('finishes at the clean rep target and beyond, ignoring failed reps and hold time', () => {
    expect(done(reps(3), { ...progress, reps: 2, noReps: 10, heldMs: 5000 })).toBe(false);
    expect(done(reps(3), { ...progress, reps: 3 })).toBe(true);
    expect(done(reps(3), { ...progress, reps: 4 })).toBe(true);
  });

  it('finishes at the detector-clock hold target and beyond', () => {
    expect(done(seconds(2), { ...progress, heldMs: 1999, reps: 10 })).toBe(false);
    expect(done(seconds(2), { ...progress, heldMs: 2000 })).toBe(true);
    expect(done(seconds(2), { ...progress, heldMs: 2001 })).toBe(true);
  });

  it('does not end a paused max hold; only a break ends max automatically', () => {
    expect(done(MAX, { ...progress, heldMs: 5000, phase: 'waiting' })).toBe(false);
    expect(done(MAX, { ...progress, heldMs: 5000, phase: 'active' })).toBe(false);
    expect(done(MAX, { ...progress, reps: 100 })).toBe(false);
    expect(done(MAX, { ...progress, heldMs: 5000, broken: true })).toBe(true);
  });
});

describe('defineChallenge', () => {
  it.each([0, -1, 1.5, Infinity, NaN])('rejects %s days', (days) => {
    expect(() =>
      defineChallenge({ name: 'Floor circuit', days, restartOnMiss: false, session: floorCircuit }),
    ).toThrow('days must be an integer >= 1');
  });

  it('lists every problem in one error', () => {
    expect(() =>
      defineChallenge({
        name: 'Invalid',
        days: 0,
        restartOnMiss: false,
        session: [
          {
            steps: [
              { exercise: 'squat', goal: seconds(0) },
              { exercise: 'plank', goal: reps(1.5) },
            ],
            rounds: 0,
          },
        ],
      }),
    ).toThrow(
      [
        'block 1: rounds must be an integer >= 1',
        'block 1 step 1: seconds must be an integer >= 1',
        'block 1 step 1: squat takes reps or max, not seconds',
        'block 1 step 2: reps must be an integer >= 1',
        'block 1 step 2: plank takes seconds or max, not reps',
        'days must be an integer >= 1',
      ].join('\n'),
    );
  });

  it.each([1, 30])('accepts a valid %s-day floor circuit', (days) => {
    const challenge = defineChallenge({
      name: 'Floor circuit',
      days,
      restartOnMiss: false,
      session: floorCircuit,
    });
    expect(expand(challenge.session)).toHaveLength(8);
  });
});
