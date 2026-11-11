import { describe, expect, it } from 'vite-plus/test';

import { addDays, setPoints, weekPoints } from './points';

const reps = (exercise: string, goal: object, n: number) => ({
  exercise,
  goal,
  reps: n,
  heldMs: 0,
});

describe('points', () => {
  it('scores the work done, up to the goal, weighted by how hard the exercise is', () => {
    const squats = (n: number) => setPoints(reps('squat', { type: 'reps', n: 10 }, n));
    expect(squats(10)).toBeCloseTo(10);
    expect(squats(5)).toBeCloseTo(5);
    expect(squats(30)).toBeCloseTo(10);
    expect(setPoints(reps('squat', { type: 'max' }, 30))).toBeCloseTo(30);
    // 7.5 MET × 6.9 s against the squat's 3.8 × 2.57.
    expect(setPoints(reps('burpee', { type: 'reps', n: 10 }, 10))).toBeCloseTo(53, 0);
    const plank = (heldMs: number) =>
      setPoints({ exercise: 'plank', goal: { type: 'seconds', n: 30 }, reps: 0, heldMs });
    expect(plank(30_000)).toBeCloseTo(8.6, 1);
    expect(plank(90_000)).toBeCloseTo(plank(30_000));
    expect(setPoints(reps('handstand', { type: 'reps', n: 10 }, 10))).toBe(0);
    expect(setPoints(reps('constructor', { type: 'reps', n: 10 }, 10))).toBe(0);
    // A goal below zero is no goal: it can't take points away.
    expect(setPoints(reps('squat', { type: 'reps', n: -5 }, 10))).toBeCloseTo(10);
  });

  it('adds 5% for each streak day before this one, up to 50%, and a frozen day keeps the streak', () => {
    const tenSquats = { day: '2026-11-20', ...reps('squat', { type: 'reps', n: 10 }, 10) };
    const daysBefore = (n: number) =>
      new Set(Array.from({ length: n }, (_, i) => addDays('2026-11-20', -i)));
    expect(weekPoints([tenSquats], new Set())).toBe(10);
    expect(weekPoints([tenSquats], daysBefore(1))).toBe(10);
    expect(weekPoints([tenSquats], daysBefore(5))).toBe(12);
    expect(weekPoints([tenSquats], daysBefore(30))).toBe(15);
    // Trained the day before yesterday; yesterday missed, or saved by a freeze.
    const gap = new Set(['2026-11-20', '2026-11-18']);
    expect(weekPoints([tenSquats], gap)).toBe(10);
    expect(weekPoints([tenSquats], new Set([...gap, '2026-11-19']))).toBe(11);
  });
});
