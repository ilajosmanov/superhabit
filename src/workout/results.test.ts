import { describe, expect, it } from 'vite-plus/test';

import type { ExerciseId } from '@/exercises/registry';

import { bestRep, clipTime, metEveryGoal } from './results';
import type { Attempt, StepResult } from './results';
import { expand, MAX, reps, seconds } from './plan';

// Gauges come from the registry: squat down 100°, push-up down 90°, glute bridge down 160° (rising).
const set = (exercise: ExerciseId, attempts: Omit<Attempt, 'cue'>[]): StepResult => ({
  exercise,
  round: 1,
  startedAt: 0,
  endedAt: 1000,
  goal: reps(10),
  reps: 0,
  noReps: 0,
  heldMs: 0,
  attempts: attempts.map((a) => ({ ...a, cue: null })),
  stats: null,
});
const clip = (atMs: number) => ({ uri: 'file:///a.mp4', atMs });

describe('clipTime', () => {
  it('puts the rep bottom on the file timeline', () => {
    expect(clipTime(10_000, 14_500, 800)).toBe(3700);
    expect(clipTime(10_000, 14_500, null)).toBe(4500);
  });

  it('is negative for a bottom before the file start', () => {
    expect(clipTime(10_000, 10_200, 800)).toBe(-600);
  });
});

describe('bestRep', () => {
  it('picks the filmed counted rep deepest past its own threshold, numbered within its set', () => {
    const sets = [
      set('squat', [
        { counted: true, depth: 88, clip: clip(1000) }, // 12° past 100
        { counted: false, depth: 60, clip: clip(2000) }, // no-rep: never best
      ]),
      set('pushup', [
        { counted: false, depth: 70 },
        { counted: true, depth: 82, clip: clip(500) }, // shallower in degrees, only 8° past 90
        { counted: true, depth: 75, clip: { uri: 'file:///b.mp4', atMs: 4200 } }, // 15° past 90
      ]),
    ];
    expect(bestRep(sets)).toEqual({
      uri: 'file:///b.mp4',
      atMs: 4200,
      exercise: 'pushup',
      name: 'push-ups',
      rep: 2,
      depth: 75,
    });
  });

  it('ranks a squat 12° past 100° over a push-up 8° past 90°, though its angle is larger', () => {
    const sets = [
      set('squat', [{ counted: true, depth: 88, clip: clip(1000) }]),
      set('pushup', [{ counted: true, depth: 82, clip: clip(500) }]),
    ];
    expect(bestRep(sets)).toMatchObject({ exercise: 'squat', name: 'squats', depth: 88 });
  });

  it('skips unfilmed reps and keeps the first of equal depth', () => {
    const sets = [
      set('squat', [
        { counted: true, depth: 70 }, // not filmed
        { counted: true, depth: 85, clip: clip(1) },
        { counted: true, depth: 85, clip: clip(2) },
      ]),
    ];
    expect(bestRep(sets)).toMatchObject({ atMs: 1, rep: 2, depth: 85 });
  });

  it('compares rising and falling gauges by margin beyond their own down threshold', () => {
    const falling = set('squat', [
      { counted: true, depth: 95, clip: clip(1) }, // 5° past 100
    ]);
    const rising = set('glute-bridge', [{ counted: true, depth: 170, clip: clip(2) }]); // 10° past 160
    expect(bestRep([falling, rising])).toMatchObject({
      name: 'glute bridges',
      depth: 170,
      atMs: 2,
    });
  });

  it('skips exercises without a depth gauge', () => {
    const ungauged = set('plank', [{ counted: true, depth: 0, clip: clip(1) }]);
    const filmed = set('squat', [{ counted: true, depth: 95, clip: clip(2) }]);
    expect(bestRep([ungauged, filmed])).toMatchObject({ exercise: 'squat', atMs: 2 });
    expect(bestRep([ungauged])).toBeNull();
  });

  it('is null when nothing was filmed', () => {
    expect(bestRep([set('squat', [{ counted: true, depth: 80 }])])).toBeNull();
    expect(bestRep([])).toBeNull();
  });
});

describe('metEveryGoal', () => {
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
  const squats = (n: number) => ({ ...set('squat', []), reps: n });
  const plank = (heldMs: number) => ({ ...set('plank', []), goal: seconds(30), heldMs });
  const longest = (heldMs: number) => ({ ...set('plank', []), goal: MAX, heldMs });

  it('needs every exercise set at its goal, rests aside', () => {
    expect(metEveryGoal(steps, [squats(10), plank(30_000), longest(1500)])).toBe(true);
  });

  it.each([
    ['a set short of its reps', [squats(9), plank(30_000), longest(1500)]],
    ['a hold short of its seconds', [squats(10), plank(29_999), longest(1500)]],
    ['an open-ended set with nothing done', [squats(10), plank(30_000), longest(0)]],
    ['a set never reached', [squats(10), plank(30_000)]],
  ])('fails with %s', (_, results) => {
    expect(metEveryGoal(steps, results)).toBe(false);
  });
});
