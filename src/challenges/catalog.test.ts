import { describe, expect, it } from 'vite-plus/test';

import { filterCatalog, toEntry } from './catalog';
import { SUGGESTED_CHALLENGES, SUGGESTED_GROUPS } from './suggested';
import { MAX, reps, seconds } from '@/workout/plan/plan';

describe('toEntry', () => {
  it('leads a one-off circuit with its total reps, and summarizes a calendar with recovery', () => {
    const challenge = {
      name: 'Benchmark',
      days: 1,
      dailyTotal: false,
      restartOnMiss: false,
      session: [
        {
          rounds: 10,
          steps: [
            { exercise: 'squat', goal: reps(20) },
            { exercise: 'pushup', goal: reps(20) },
          ],
        },
      ],
    } as const;
    expect(toEntry('benchmark', challenge).workload).toEqual({ amount: 400, unit: 'REPS' });
    const scheduled = toEntry('calendar', {
      ...challenge,
      days: 3,
      schedule: ['training', 'rest', 'training'],
    });
    expect(scheduled.schedule).toBe('2 WORKOUTS · 1 REST DAY');
    expect(scheduled.workload).toBeUndefined();
  });
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

describe('filterCatalog', () => {
  const ours = SUGGESTED_CHALLENGES.map(({ id, group, challenge }) => ({
    group,
    ...toEntry(id, challenge),
  }));
  const mine = toEntry('mine', { ...SUGGESTED_CHALLENGES[0].challenge, name: 'Mine' });
  const shown = (view: ReturnType<typeof filterCatalog>) =>
    view.order.filter(({ on }) => on).map(({ entry }) => entry.id);

  it('shows All once you join every daily goal, keeping that chip at 0, and one daily goal once you leave it', () => {
    const rest = ours.filter(({ group }) => group !== 'Daily goals');
    const joinedAll = filterCatalog(rest, 'Daily goals');
    expect(joinedAll.shown).toBe('all');
    expect(joinedAll.chips).toContainEqual({ kind: 'Daily goals', count: 0 });
    expect(shown(joinedAll)).toHaveLength(rest.length);
    const leftOne = filterCatalog(
      [...rest, ...ours.filter(({ group }) => group === 'Daily goals').slice(0, 1)],
      'Daily goals',
    );
    expect(shown(leftOne)).toHaveLength(1);
  });

  it('lists ours by group, then yours, with Made by you only once you made one', () => {
    expect(filterCatalog(ours, 'all').chips.map(({ kind }) => kind)).not.toContain('yours');
    const view = filterCatalog([mine, ...ours], 'yours');
    expect(view.chips).toContainEqual({ kind: 'yours', count: 1 });
    expect(shown(view)).toEqual(['mine']);
    expect(view.order.at(-1)?.entry.id).toBe('mine');
    const groups = view.order
      .slice(0, -1)
      .map(({ entry }) => ours.find((o) => o.id === entry.id)?.group ?? '');
    const rank = (group: string) => SUGGESTED_GROUPS.findIndex((g) => g === group);
    expect(groups).toEqual([...groups].sort((a, b) => rank(a) - rank(b)));
  });
});
