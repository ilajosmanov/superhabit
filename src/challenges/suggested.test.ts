import { describe, expect, it } from 'vite-plus/test';

import { SUGGESTED_CHALLENGES, SUGGESTED_HISTORY } from './suggested';
import { knobsOf, tuned } from './tune';
import { expand, readPlan } from '@/workout/plan/plan';

function suggested(name: string) {
  const entry = SUGGESTED_CHALLENGES.find(({ challenge }) => challenge.name === name);
  if (!entry) throw new Error(`missing suggested challenge: ${name}`);
  return entry.challenge;
}

describe('suggested workout prescriptions', () => {
  it('alternates push-ups and squats in every round, resting after the pair', () => {
    const steps = expand(suggested('Push-up squat rounds').session);
    expect(steps.slice(0, 6).map(({ exercise, goal }) => [exercise, goal])).toEqual([
      ['pushup', { type: 'reps', n: 10 }],
      ['squat', { type: 'reps', n: 15 }],
      ['rest', { type: 'seconds', n: 30 }],
      ['pushup', { type: 'reps', n: 10 }],
      ['squat', { type: 'reps', n: 15 }],
      ['rest', { type: 'seconds', n: 30 }],
    ]);
    expect(steps.filter(({ exercise }) => exercise !== 'rest')).toHaveLength(10);
  });

  it('starts and ends the descending ladder with squats between burpees and push-ups', () => {
    const steps = expand(suggested('Down the ladder').session);
    expect(steps.slice(0, 4).map(({ exercise }) => exercise)).toEqual([
      'burpee',
      'squat',
      'pushup',
      'rest',
    ]);
    expect(steps.slice(-3).map(({ exercise, goal }) => [exercise, goal])).toEqual([
      ['burpee', { type: 'reps', n: 1 }],
      ['squat', { type: 'reps', n: 1 }],
      ['pushup', { type: 'reps', n: 1 }],
    ]);
  });

  it.each([
    ['Push-up squat crossover', 'pushup', [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]],
    ['Push-up squat crossover', 'squat', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['Squat burpee ladder', 'squat', [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]],
    ['Squat burpee pyramid', 'squat', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]],
  ] as const)('%s follows its prescribed %s progression', (name, exercise, targets) => {
    const steps = expand(suggested(name).session);
    expect(
      steps
        .filter((step) => step.exercise === exercise)
        .map(({ goal }) => (goal.type === 'reps' ? goal.n : null)),
    ).toEqual(targets);
  });

  // Independent totals from the requested routines, including the corrected four-move 800.
  it.each([
    ['Fifty all round', 5, 150, 100],
    ['Short bodyweight circuit', 7, 75, 60],
    ['800 reps', 40, 800, 0],
    ['Push-up squat crossover', 20, 110, 0],
    ['Down the ladder', 30, 165, 0],
    ['Floor circuit', 12, 120, 90],
    ['Standing circuit', 6, 105, 0],
    ['Floor ladder', 10, 63, 0],
    ['Squat burpee ladder', 20, 110, 0],
    ['Squat burpee pyramid', 38, 200, 0],
    ['21-15-9', 6, 90, 0],
    ['Burpee 5-10-15', 24, 240, 0],
    ['Push-up squat twenty', 40, 500, 0],
    ['Core and glutes', 8, 240, 120],
    ['Ab circuit', 9, 90, 90],
    ['Push-up and core endurance', 15, 300, 300],
    ['Lunges and squats', 6, 180, 0],
    ['100/100/100', 3, 300, 0],
  ] as const)('%s ships the requested workload', (name, count, reps, seconds) => {
    const steps = expand(suggested(name).session).filter(({ exercise }) => exercise !== 'rest');
    expect(steps).toHaveLength(count);
    expect(steps.reduce((sum, { goal }) => sum + (goal.type === 'reps' ? goal.n : 0), 0)).toBe(
      reps,
    );
    expect(steps.reduce((sum, { goal }) => sum + (goal.type === 'seconds' ? goal.n : 0), 0)).toBe(
      seconds,
    );
  });

  it.each([
    ['100 push-ups a day', 'pushup', 100, 30],
    ['100 squats a day', 'squat', 100, 30],
    ['22 push-ups for 22 days', 'pushup', 22, 22],
  ] as const)('%s supports smaller daily totals', (name, exercise, amount, days) => {
    const original = suggested(name);
    expect(original).toMatchObject({ dailyTotal: true, days });
    const [knob] = knobsOf(original);
    expect(knob).toMatchObject({ exercise, ours: amount });
    const changed = tuned(original, { [knob.key]: 5, days: 7 });
    expect(changed).toMatchObject({ dailyTotal: true, days: 7 });
    expect(expand(changed.session)).toMatchObject([{ exercise, goal: { type: 'reps', n: 5 } }]);
  });

  it('keeps every suggestion tunable and readable after lowering all targets and rounds', () => {
    for (const { challenge } of SUGGESTED_CHALLENGES) {
      const values = Object.fromEntries(knobsOf(challenge).map(({ key }) => [key, 1]));
      const changed = tuned(challenge, values);
      // The persisted form must remain playable, including ladders and formerly repeated final rests.
      expect(readPlan(JSON.parse(JSON.stringify(changed.session))), challenge.name).not.toBeNull();
      expect(
        expand(changed.session)
          .filter(({ exercise }) => exercise !== 'rest')
          .every(({ goal }) => goal.type !== 'max' && goal.n === 1),
      ).toBe(true);
    }
  });

  it('has unique seed identities and avoids duplicate sessions and untuned side planks', () => {
    expect(new Set(SUGGESTED_CHALLENGES.map(({ id }) => id)).size).toBe(
      SUGGESTED_CHALLENGES.length,
    );
    const versions = [...SUGGESTED_HISTORY, ...SUGGESTED_CHALLENGES];
    expect(new Set(versions.map(({ versionId }) => versionId)).size).toBe(versions.length);
    const routines = SUGGESTED_CHALLENGES.map(({ challenge }) => {
      const steps = expand(challenge.session).filter(({ exercise }) => exercise !== 'rest');
      expect(steps.some(({ exercise }) => exercise === 'side-plank')).toBe(false);
      return JSON.stringify(steps.map(({ exercise, goal }) => [exercise, goal]));
    });
    expect(new Set(routines).size).toBe(routines.length);
  });
});
