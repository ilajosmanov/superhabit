import { describe, expect, it } from 'vite-plus/test';

import { toEntry } from './catalog';
import { MAX, reps, seconds } from '@/workout/plan/plan';

describe('toEntry', () => {
  it('lists each exercise step once and folds rounds and rest into the note', () => {
    const entry = toEntry('c', {
      name: 'C',
      days: 30,
      restartOnMiss: false,
      dailyTotal: false,
      session: [
        {
          steps: [
            { exercise: 'pushup', goal: reps(10) },
            { exercise: 'plank', goal: seconds(30) },
            { exercise: 'rest', goal: seconds(30) },
          ],
          rounds: 3,
        },
        { steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 },
      ],
    });
    expect(entry.steps.map(({ name, goal }) => `${name} ${goal}`)).toEqual([
      'Push-ups ×10',
      'Plank 30S',
      'Squats MAX',
    ]);
    expect(entry.note).toBe('3 ROUNDS · 30S REST');
  });

  it('says a repeated round count or rest once', () => {
    const block = {
      steps: [
        { exercise: 'pushup', goal: reps(10) },
        { exercise: 'rest', goal: seconds(30) },
      ],
      rounds: 5,
    } as const;
    expect(
      toEntry('c', {
        name: 'C',
        days: 14,
        restartOnMiss: false,
        dailyTotal: false,
        session: [block, block],
      }).note,
    ).toBe('5 ROUNDS · 30S REST');
  });

  it('has no note for a single round without rest', () => {
    expect(
      toEntry('c', {
        name: 'C',
        days: 21,
        restartOnMiss: false,
        dailyTotal: false,
        session: [{ steps: [{ exercise: 'squat', goal: reps(100) }], rounds: 1 }],
      }).note,
    ).toBeUndefined();
  });
});
