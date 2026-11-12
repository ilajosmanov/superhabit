import { describe, expect, it } from 'vite-plus/test';

import { expand, type Session } from './plan';
import { circuit, exerciseSet, ladder, session, sets } from './structures';

/** What the runner receives, without the bookkeeping attached to each expanded step. */
const playback = (plan: Session) => expand(plan).map(({ exercise, goal }) => [exercise, goal]);

describe('authored workout structures', () => {
  it('runs mixed reps and holds with separate exercise and round rests, never a final rest', () => {
    const plan = circuit({
      exercises: [exerciseSet('pushup', 5), exerciseSet('plank', 30)],
      rounds: 2,
      restBetweenExercises: 10,
      restBetweenRounds: 60,
    });
    expect(playback(plan)).toEqual([
      ['pushup', { type: 'reps', n: 5 }],
      ['rest', { type: 'seconds', n: 10 }],
      ['plank', { type: 'seconds', n: 30 }],
      ['rest', { type: 'seconds', n: 60 }],
      ['pushup', { type: 'reps', n: 5 }],
      ['rest', { type: 'seconds', n: 10 }],
      ['plank', { type: 'seconds', n: 30 }],
    ]);
  });

  it('joins repeated sets to a one-round part, retaining the rest at the join', () => {
    const first = sets({ exercise: exerciseSet('squat', 2), rounds: 2, restBetweenSets: 20 });
    const before = structuredClone(first);
    const plan = session(
      first,
      sets({ exercise: exerciseSet('plank', 'max'), restBetweenSets: 60 }),
    );
    expect(playback(plan)).toEqual([
      ['squat', { type: 'reps', n: 2 }],
      ['rest', { type: 'seconds', n: 20 }],
      ['squat', { type: 'reps', n: 2 }],
      ['rest', { type: 'seconds', n: 20 }],
      ['plank', { type: 'max' }],
    ]);
    expect(first).toEqual(before);
  });

  it('keeps crossover targets independent and rests only between rungs', () => {
    const plan = ladder({
      rungs: [3, 2, 1],
      exercises: (n) => [exerciseSet('pushup', n), exerciseSet('squat', 4 - n)],
      restBetweenRungs: 20,
    });
    expect(playback(plan)).toEqual([
      ['pushup', { type: 'reps', n: 3 }],
      ['squat', { type: 'reps', n: 1 }],
      ['rest', { type: 'seconds', n: 20 }],
      ['pushup', { type: 'reps', n: 2 }],
      ['squat', { type: 'reps', n: 2 }],
      ['rest', { type: 'seconds', n: 20 }],
      ['pushup', { type: 'reps', n: 1 }],
      ['squat', { type: 'reps', n: 3 }],
    ]);
    expect(
      expand(plan)
        .filter(({ exercise }) => exercise !== 'rest')
        .map(({ block, round }) => [block, round]),
    ).toEqual([
      [1, 1],
      [1, 1],
      [2, 1],
      [2, 1],
      [3, 1],
      [3, 1],
    ]);
  });

  it('preserves explicit nonuniform and repeated rungs without inserting rest for zero', () => {
    const plan = ladder({
      rungs: [21, 15, 9, 15, 21],
      exercises: (n) => [exerciseSet('situp', n)],
    });
    expect(playback(plan)).toEqual([
      ['situp', { type: 'reps', n: 21 }],
      ['situp', { type: 'reps', n: 15 }],
      ['situp', { type: 'reps', n: 9 }],
      ['situp', { type: 'reps', n: 15 }],
      ['situp', { type: 'reps', n: 21 }],
    ]);
  });

  it.each([0, -1, 1.5, Infinity, NaN, 1001])('rejects an unplayable round count %s', (rounds) => {
    expect(() => sets({ exercise: exerciseSet('squat', 10), rounds })).toThrow(
      'invalid workout structure',
    );
  });

  it.each([-1, 1.5, Infinity, NaN])(
    'rejects an invalid rest %s, even on a single round',
    (rest) => {
      expect(() =>
        circuit({ exercises: [exerciseSet('squat', 10)], restBetweenExercises: rest }),
      ).toThrow('rest must');
      expect(() => sets({ exercise: exerciseSet('squat', 10), restBetweenSets: rest })).toThrow(
        'rest must',
      );
      expect(() =>
        ladder({ rungs: [1], exercises: (n) => [exerciseSet('squat', n)], restBetweenRungs: rest }),
      ).toThrow('rest must');
    },
  );

  it('rejects invalid rungs even if a callback ignores them, and rejects invalid produced targets', () => {
    expect(() => ladder({ rungs: [0], exercises: () => [exerciseSet('squat', 1)] })).toThrow(
      'ladder rungs',
    );
    expect(() =>
      ladder({ rungs: [1, 2], exercises: (n) => [exerciseSet('squat', 2 - n)] }),
    ).toThrow('invalid workout structure');
  });
});
