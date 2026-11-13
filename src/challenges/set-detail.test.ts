import { describe, expect, it } from 'vite-plus/test';

import type { Attempt } from '@/workout/plan/results';

import { setDetail } from './set-detail';

const rep = (
  depth: number | null,
  down: number,
  up: number,
  counted = true,
  cue: string | null = null,
) =>
  ({
    startMs: 0,
    bottomMs: depth === null ? null : down,
    endMs: down + up,
    counted,
    depth,
    cue,
  }) satisfies Attempt;

describe('setDetail', () => {
  it('reads a push-up set: deepest clean rep, median tempo, and the shallow no-rep by number', () => {
    const attempts = [
      rep(92, 1200, 800),
      rep(88, 1300, 800),
      rep(108, 900, 600, false, 'Go lower'),
      rep(95, 1100, 700),
    ];
    const detail = setDetail([{ reps: 3, noReps: 1, heldMs: 0, attempts }], { down: 100, up: 150 });
    // The no-rep went to 108°, not deeper than 88°, and its fast tempo stays out of the median.
    expect(detail).toMatchObject({
      reps: 3,
      noReps: 1,
      deepest: 88,
      downMs: 1200,
      upMs: 800,
      repMs: null,
    });
    expect(detail.misses).toEqual([expect.objectContaining({ n: 3, cue: 'Go lower', depth: 108 })]);
  });

  it('takes the mean of the middle two for an even count of clean reps', () => {
    const attempts = [rep(90, 1000, 800), rep(92, 3000, 600)];
    const detail = setDetail([{ reps: 2, noReps: 0, heldMs: 0, attempts }], { down: 100, up: 150 });
    expect(detail).toMatchObject({ downMs: 2000, upMs: 700 });
  });

  it('takes the highest as deepest when the measure rises (glute bridge hips)', () => {
    const attempts = [rep(19, 1000, 1000), rep(24, 1000, 1000), rep(21, 1000, 1000)];
    expect(
      setDetail([{ reps: 3, noReps: 0, heldMs: 0, attempts }], { down: 18, up: 3 }).deepest,
    ).toBe(24);
  });

  it('times a burpee whole, since it has no bottom or depth', () => {
    const attempts = [rep(null, 3000, 0), rep(null, 4000, 0), rep(null, 3500, 0)];
    const detail = setDetail([{ reps: 3, noReps: 0, heldMs: 0, attempts }], null);
    expect(detail).toMatchObject({ deepest: null, downMs: null, upMs: null, repMs: 3500 });
  });

  it("reads a daily total's tries as one set, numbering reps on across them", () => {
    const morning = {
      reps: 2,
      noReps: 0,
      heldMs: 0,
      attempts: [rep(90, 1000, 800), rep(91, 1000, 800)],
    };
    const evening = {
      reps: 1,
      noReps: 1,
      heldMs: 0,
      attempts: [rep(110, 900, 700, false, 'Go lower'), rep(93, 1000, 800)],
    };
    const detail = setDetail([morning, evening], { down: 100, up: 150 });
    expect(detail).toMatchObject({ reps: 3, noReps: 1 });
    expect(detail.misses.map(({ n }) => n)).toEqual([3]);
  });
});
