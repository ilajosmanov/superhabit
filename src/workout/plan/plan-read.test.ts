import { describe, expect, it } from 'vite-plus/test';

import { MAX, readPlan, reps, seconds, type Session } from './plan';

describe('readPlan', () => {
  it('reads stored rounds, reps, holds and MAX rests without changing the plan', () => {
    const stored: Session = [
      {
        steps: [
          { exercise: 'pushup', goal: reps(10) },
          { exercise: 'plank', goal: MAX },
          { exercise: 'rest', goal: MAX },
          { exercise: 'plank', goal: seconds(30) },
        ],
        rounds: 2,
      },
    ];
    expect(readPlan(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it.each(
    [
      [{ steps: [{ exercise: 'future-exercise', goal: reps(10) }], rounds: 1 }],
      [{ steps: [{ exercise: 'pushup', goal: { type: 'distance', n: 10 } }], rounds: 1 }],
      [{ steps: [{ exercise: 'pushup', goal: reps(10), future: true }], rounds: 1 }],
      [{ steps: [{ exercise: 'pushup', goal: reps(10) }], rounds: 1001 }],
    ].map((stored) => ({ stored })),
  )('returns null for a plan from a newer app: $stored', ({ stored }) => {
    expect(readPlan(stored)).toBeNull();
  });
});
