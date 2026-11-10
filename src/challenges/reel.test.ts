import { describe, expect, it } from 'vite-plus/test';

import { set as kept } from '@/challenges/__fixtures__/progress';
import { expand, reps, seconds } from '@/workout/plan/plan';
import { after, dayReel, pointAt, reelOf } from './reel';
import type { StepResult } from '@/workout/plan/results';

const set = (seconds: number, takes: string[]): StepResult => ({
  id: 'set',
  workoutId: 'workout',
  planStep: 0,
  counterVersion: '1.0.0',
  exercise: 'squat',
  round: 1,
  startedAt: 0,
  endedAt: seconds * 1000,
  goal: reps(10),
  reps: 0,
  noReps: 0,
  heldMs: 0,
  attempts: [],
  takes,
  stats: null,
});

// 30 s of squats, a set that wasn't filmed, then 10 s of squats in two files (a pause between).
const clips = reelOf([set(30, ['a']), set(20, []), set(10, ['b', 'c'])]);

describe('the reel', () => {
  it('leaves out sets that were not filmed, keeping where each set sits', () => {
    expect(clips.map(({ set, takes }) => [set, takes])).toEqual([
      [0, ['a']],
      [2, ['b', 'c']],
    ]);
  });

  it('plays file after file, then starts over', () => {
    expect(after(clips, { clip: 0, part: 0 })).toEqual({ clip: 1, part: 0 });
    expect(after(clips, { clip: 1, part: 0 })).toEqual({ clip: 1, part: 1 });
    expect(after(clips, { clip: 1, part: 1 })).toEqual({ clip: 0, part: 0 });
  });

  it.each([
    [0, { clip: 0, part: 0, into: 0 }],
    [0.375, { clip: 0, part: 0, into: 0.5 }], // halfway through the 30 s set
    [0.8125, { clip: 1, part: 0, into: 0.5 }], // a quarter into the 10 s set: halfway through its first file
    [0.9375, { clip: 1, part: 1, into: 0.5 }],
    [1, { clip: 1, part: 1, into: 1 }],
    [1.5, { clip: 1, part: 1, into: 1 }], // a drag past the end stays on the last frame
  ])('finds the spot under %s of the bar, sized by how long each set ran', (x, spot) => {
    expect(pointAt(clips, x)).toEqual(spot);
  });
});

describe("a day's reel", () => {
  // Two rounds of push-ups with a rest between: steps 0, 1 (rest), 2.
  const steps = expand([
    {
      steps: [
        { exercise: 'pushup', goal: reps(10) },
        { exercise: 'rest', goal: seconds(30) },
      ],
      rounds: 2,
    },
  ]);

  it('plays the sets that have files, in the order you did them, each where it sits in the session', () => {
    const first = kept('w', 10, { id: 'one', planStep: 0, startedAt: 1 });
    const second = kept('w', 8, { id: 'two', planStep: 2, startedAt: 2 });
    const unfilmed = kept('x', 5, { id: 'three', planStep: 0, startedAt: 3 });
    const videos = new Map([
      ['one', ['one-0']],
      ['two', ['two-0', 'two-2']],
    ]);

    expect(dayReel(steps, [unfilmed, second, first], videos)).toEqual([
      { set: 0, result: { ...first, round: 1 }, takes: ['one-0'] },
      { set: 1, result: { ...second, round: 2 }, takes: ['two-0', 'two-2'] },
    ]);
  });
});
