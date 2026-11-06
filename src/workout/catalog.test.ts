import { describe, expect, it } from 'vite-plus/test';

import { CATALOG, toEntry } from './catalog';
import { CHALLENGES } from './challenges';
import { MAX, reps, seconds } from './plan';

describe('toEntry', () => {
  it('lists each exercise step once and folds rounds and rest into the note', () => {
    const entry = toEntry('c', {
      name: 'C',
      days: 30,
      restartOnMiss: false,
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
      'Plank 30 s',
      'Squats MAX',
    ]);
    expect(entry.note).toBe('3 ROUNDS · 30 S REST');
  });

  it('has no note for a single round without rest', () => {
    expect(
      toEntry('c', {
        name: 'C',
        days: 21,
        restartOnMiss: false,
        session: [{ steps: [{ exercise: 'squat', goal: reps(100) }], rounds: 1 }],
      }).note,
    ).toBeUndefined();
  });
});

it('offers every multi-day challenge and no one-day test', () => {
  const multiDay = [...CHALLENGES].filter(([, c]) => c.days > 1).map(([id]) => id);
  expect(CATALOG.map((entry) => entry.id)).toEqual(multiDay);
});

it('marks a challenge experimental when one of its exercises is', () => {
  const entry = (exercise: 'squat' | 'lunge') =>
    toEntry('c', {
      name: 'C',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise, goal: MAX }], rounds: 1 }],
    });
  expect(entry('squat').experimental).toBe(false);
  expect(entry('lunge').experimental).toBe(true);
});
