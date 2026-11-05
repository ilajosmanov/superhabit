import { describe, expect, it } from 'vite-plus/test';

import { summary } from './challenges';

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
