import { describe, expect, it } from 'vite-plus/test';

import { counting, dayResult, versionOf, type ProgressInput } from './progress';
import { MAX, reps, seconds } from '@/workout/plan';

import { input, set, workout } from './__fixtures__/progress';

const daily: ProgressInput = { ...input, version: { ...input.version, dailyTotal: true } };

// Unsorted input deliberately: neither table reads nor caller order determine the shown try.
const circuit: ProgressInput = {
  ...input,
  version: {
    ...input.version,
    session: [
      {
        steps: [
          { exercise: 'pushup', goal: reps(10) },
          { exercise: 'rest', goal: seconds(20) },
          { exercise: 'plank', goal: seconds(30) },
        ],
        rounds: 1,
      },
    ],
  },
  workouts: [workout('partial', 30), workout('full', 20), workout('earlier-full', 10)],
  sets: [
    set('partial', 5, { goal: reps(10) }),
    set('full', 10, { goal: reps(10) }),
    set('full', 0, { planStep: 2, exercise: 'plank', goal: seconds(30), heldMs: 30_000 }),
    set('earlier-full', 15, { goal: reps(10) }),
    set('earlier-full', 0, { planStep: 2, exercise: 'plank', goal: seconds(30), heldMs: 40_000 }),
  ],
};

describe('dayResult', () => {
  it('adds 250 + 250 toward 500, then caps extra reps at one complete day', () => {
    const first = { ...daily, workouts: [workout('a', 1)], sets: [set('a', 250)] };
    expect(dayResult(first, '2026-11-01')).toMatchObject({
      done: false,
      share: 0.5,
      shown: { id: 'a' },
    });
    const both = {
      ...first,
      workouts: [...first.workouts, workout('b', 2)],
      sets: [...first.sets, set('b', 250)],
    };
    expect(dayResult(both, '2026-11-01')).toMatchObject({
      done: true,
      share: 1,
      shown: { id: 'b' },
    });
    expect(dayResult({ ...both, sets: [set('a', 750), set('b', 250)] }, '2026-11-01').share).toBe(
      1,
    );
  });

  it('ignores free logs, other runs, open workouts, other dates and unrelated sets', () => {
    const data: ProgressInput = {
      ...daily,
      workouts: [
        workout('mine', 1),
        workout('free', 2, { runId: null, versionId: null }),
        workout('other', 3, { runId: 'other-run' }),
        workout('open', 4, { status: 'open' }),
        workout('tomorrow', 5, { day: '2026-11-02' }),
      ],
      sets: [
        set('mine', 100),
        set('free', 500),
        set('other', 500),
        set('open', 500),
        set('tomorrow', 500),
        set('unknown-workout', 500),
        set('mine', 500, { planStep: 99 }),
        set('mine', 500, { exercise: 'squat' }),
      ],
    };
    expect(dayResult(data, '2026-11-01')).toMatchObject({
      done: false,
      share: 0.2,
      shown: { id: 'mine' },
    });
  });

  it('adds hold milliseconds before comparing with a seconds target', () => {
    const data: ProgressInput = {
      ...daily,
      version: {
        ...daily.version,
        session: [
          {
            steps: [{ exercise: 'plank', goal: seconds(30) }],
            rounds: 1,
          },
        ],
      },
      workouts: [workout('a', 1), workout('b', 2)],
      sets: [
        set('a', 0, { exercise: 'plank', goal: seconds(30), heldMs: 15_000 }),
        set('b', 0, { exercise: 'plank', goal: seconds(30), heldMs: 15_000 }),
      ],
    };
    expect(dayResult({ ...data, workouts: [workout('a', 1)] }, '2026-11-01')).toMatchObject({
      done: false,
      share: 0.5,
    });
    expect(dayResult(data, '2026-11-01')).toMatchObject({ done: true, share: 1 });
  });

  it('shows the latest completed try despite a later partial redo', () => {
    expect(dayResult(circuit, '2026-11-01')).toMatchObject({
      done: true,
      share: 1,
      shown: { id: 'full' },
    });
  });

  it('matches repeated exercises by planStep, including rest gaps', () => {
    const data: ProgressInput = {
      ...input,
      version: {
        ...input.version,
        session: [
          {
            steps: [
              { exercise: 'pushup', goal: reps(10) },
              { exercise: 'rest', goal: seconds(20) },
              { exercise: 'pushup', goal: reps(40) },
            ],
            rounds: 1,
          },
        ],
      },
      workouts: [workout('a', 1)],
      sets: [set('a', 10, { planStep: 2, goal: reps(40) })],
    };
    expect(dayResult(data, '2026-11-01')).toMatchObject({ done: false, share: 0.125 });
  });

  it('shows the latest partial, not the best, and never combines circuit tries', () => {
    const data: ProgressInput = {
      ...circuit,
      workouts: [workout('older', 10), workout('latest', 20)],
      sets: [
        set('older', 10, { goal: reps(10) }),
        set('older', 0, { planStep: 2, exercise: 'plank', goal: seconds(30), heldMs: 15_000 }),
        set('latest', 0, { planStep: 2, exercise: 'plank', goal: seconds(30), heldMs: 30_000 }),
      ],
    };
    expect(dayResult(data, '2026-11-01')).toMatchObject({
      done: false,
      share: 0.5,
      shown: { id: 'latest' },
    });
    expect(
      dayResult({ ...data, workouts: [workout('open', 30, { status: 'open' })] }, '2026-11-01'),
    ).toEqual({ done: false, share: 0, shown: null });
  });

  it('counts a saved MAX hold with a positive fraction of a second', () => {
    const data: ProgressInput = {
      ...input,
      version: {
        ...input.version,
        session: [
          {
            steps: [{ exercise: 'plank', goal: MAX }],
            rounds: 1,
          },
        ],
      },
      workouts: [workout('a', 1)],
      sets: [set('a', 0, { exercise: 'plank', goal: MAX, heldMs: 500 })],
    };
    expect(dayResult(data, '2026-11-01').done).toBe(true);
    expect(dayResult({ ...data, sets: [] }, '2026-11-01').done).toBe(false);
  });

  it('keeps a workout against its recorded version and preserves a completed daily total after an edit', () => {
    const data: ProgressInput = {
      ...input,
      version: {
        ...input.version,
        id: 'v2',
        session: [
          {
            steps: [{ exercise: 'pushup', goal: reps(1000) }],
            rounds: 1,
          },
        ],
      },
      versions: [input.version],
      workouts: [workout('old', new Date(2026, 10, 1, 8).getTime())],
      sets: [set('old', 500)],
    };
    expect(dayResult(data, '2026-11-01')).toMatchObject({
      done: true,
      share: 1,
      shown: { id: 'old' },
    });
    expect(() => dayResult({ ...data, versions: [] }, '2026-11-01')).toThrow('Missing version');
    const total: ProgressInput = {
      ...data,
      version: { ...data.version, dailyTotal: true },
      versions: [daily.version],
    };
    expect(dayResult(total, '2026-11-01').done).toBe(true);
    expect(
      dayResult(
        {
          ...total,
          workouts: [
            ...total.workouts,
            workout('new', new Date(2026, 10, 1, 18).getTime(), { versionId: 'v2' }),
          ],
          sets: [...total.sets, set('new', 100, { goal: reps(1000) })],
        },
        '2026-11-01',
      ),
    ).toMatchObject({ done: true, share: 1, shown: { id: 'new' } });
  });

  it('breaks equal start-time ties by workout id so input order cannot change the card', () => {
    const data: ProgressInput = {
      ...input,
      workouts: [workout('b', 1), workout('a', 1)],
      sets: [set('a', 400), set('b', 100)],
    };
    expect(dayResult(data, '2026-11-01')).toMatchObject({ share: 0.2, shown: { id: 'b' } });
  });
});

it('follows the current challenge version unless the run pins an older one', () => {
  expect(versionOf(input.run, { currentVersionId: 'new' })).toBe('new');
  expect(versionOf({ pinnedVersionId: 'old' }, { currentVersionId: 'new' })).toBe('old');
});

describe('counting an open try as if it were Done', () => {
  const day = '2026-11-01';
  const tries = (base: ProgressInput, earlier: number, now: number) => ({
    ...base,
    workouts: [workout('earlier', 1), workout('now', 2, { status: 'open' })],
    sets: [set('earlier', earlier), set('now', now)],
  });

  it('adds it to a daily total: 250 saved and 250 now make 500 of 500', () => {
    expect(dayResult(counting(tries(daily, 250, 250), 'now'), day)).toMatchObject({
      done: true,
      share: 1,
    });
  });

  it('shows it as the latest partial try: 400 of 500 earlier, 100 now shows 20%', () => {
    expect(dayResult(counting(tries(input, 400, 100), 'now'), day)).toMatchObject({
      done: false,
      share: 0.2,
      shown: { id: 'now' },
    });
  });

  it('keeps a day an earlier try completed', () => {
    expect(dayResult(counting(tries(input, 500, 100), 'now'), day)).toMatchObject({
      done: true,
      share: 1,
      shown: { id: 'earlier' },
    });
  });
});
