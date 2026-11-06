import { describe, expect, it } from 'vite-plus/test';

import { bestRep, clipTime } from './results';
import type { Attempt, SetResult } from './results';

const set = (name: string, down: number, attempts: Omit<Attempt, 'cue'>[]): SetResult => ({
  name,
  down,
  target: 10,
  reps: 0,
  noReps: 0,
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
      set('squats', 100, [
        { counted: true, depth: 88, clip: clip(1000) }, // 12° past 100
        { counted: false, depth: 60, clip: clip(2000) }, // no-rep: never best
      ]),
      set('push-ups', 90, [
        { counted: false, depth: 70 },
        { counted: true, depth: 82, clip: clip(500) }, // shallower in degrees, only 8° past 90
        { counted: true, depth: 75, clip: { uri: 'file:///b.mp4', atMs: 4200 } }, // 15° past 90
      ]),
    ];
    expect(bestRep(sets)).toEqual({
      uri: 'file:///b.mp4',
      atMs: 4200,
      name: 'push-ups',
      rep: 2,
      depth: 75,
    });
  });

  it('ranks a squat 12° past 100° over a push-up 8° past 90°, though its angle is larger', () => {
    const sets = [
      set('squats', 100, [{ counted: true, depth: 88, clip: clip(1000) }]),
      set('push-ups', 90, [{ counted: true, depth: 82, clip: clip(500) }]),
    ];
    expect(bestRep(sets)).toMatchObject({ name: 'squats', depth: 88 });
  });

  it('skips unfilmed reps and keeps the first of equal depth', () => {
    const sets = [
      set('squats', 100, [
        { counted: true, depth: 70 }, // not filmed
        { counted: true, depth: 85, clip: clip(1) },
        { counted: true, depth: 85, clip: clip(2) },
      ]),
    ];
    expect(bestRep(sets)).toMatchObject({ atMs: 1, rep: 2, depth: 85 });
  });

  it('is null when nothing was filmed', () => {
    expect(bestRep([set('squats', 100, [{ counted: true, depth: 80 }])])).toBeNull();
    expect(bestRep([])).toBeNull();
  });
});
