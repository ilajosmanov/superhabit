import { describe, expect, it } from 'vite-plus/test';

import { summary, totalReps } from './challenges';

describe('summary', () => {
  it('lists counted sets in order', () => {
    expect(
      summary({
        name: '',
        sets: [
          { exercise: 'squat', reps: 3 },
          { exercise: 'pushup', reps: 3 },
        ],
      }),
    ).toBe('3 squats, then 3 push-ups');
  });

  it('capitalises an open-ended first set', () => {
    expect(summary({ name: '', sets: [{ exercise: 'pushup', reps: Infinity }] })).toBe(
      'Push-ups, as many as you can',
    );
  });
});

describe('totalReps', () => {
  it('sums sets, and an open-ended set makes it unlimited', () => {
    const squat = { exercise: 'squat', reps: 3 } as const;
    expect(totalReps({ name: '', sets: [squat, { exercise: 'pushup', reps: 3 }] })).toBe(6);
    expect(totalReps({ name: '', sets: [squat, { exercise: 'pushup', reps: Infinity }] })).toBe(
      Infinity,
    );
  });
});
