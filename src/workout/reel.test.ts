import { describe, expect, it } from 'vite-plus/test';

import { reps } from './plan';
import { after, pointAt, reelOf } from './reel';
import type { StepResult } from './results';

const set = (seconds: number, takes: string[]): StepResult => ({
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
