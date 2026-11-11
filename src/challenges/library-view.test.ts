import { expect, it } from 'vite-plus/test';

import { dayLog, sessionChallenge, type Library } from './library-view';
import { reps } from '@/workout/plan/plan';

const version = (id: string, name: string, days: number) => ({
  id,
  challengeId: 'c',
  number: 1,
  name,
  days,
  dailyTotal: false,
  restartOnMiss: false,
  plan: [{ steps: [{ exercise: 'pushup', goal: reps(10) }], rounds: 1 }],
  createdAt: 0,
});

it('keeps the Done page on the version the session started on when the challenge is edited meanwhile', () => {
  const library: Library = {
    account: { id: 'local', name: 'You', image: null },
    sharing: null,
    // Your challenge, edited mid-session from "Old" (1 day) to "New" (2 days); the run follows edits.
    challenges: [
      { id: 'c', owner: 'local', visibility: 'private', currentVersionId: 'v2', retiredAt: null },
    ],
    versions: [version('v1', 'Old', 1), version('v2', 'New', 2)],
    runs: [
      {
        id: 'r',
        challengeId: 'c',
        pinnedVersionId: null,
        groupChallengeId: null,
        startedOn: '2026-11-09',
        endedOn: null,
        endReason: null,
      },
    ],
    workouts: [],
    sets: [],
  };
  const during = { workoutId: 'w', versionId: 'v1' };

  expect(sessionChallenge(library, 'r', '2026-11-09', during).run).toMatchObject({
    day: 1,
    days: 1,
  });
  expect(sessionChallenge(library, 'r', '2026-11-09').run).toMatchObject({ day: 1, days: 2 });
});

it("lists a day's saved workouts oldest first, with their names, run days and the plans their reels play by", () => {
  const run = (id: string, ended: boolean) => ({
    id,
    challengeId: 'c',
    pinnedVersionId: null,
    groupChallengeId: null,
    startedOn: '2026-11-08',
    endedOn: ended ? '2026-11-09' : null,
    endReason: ended ? ('left' as const) : null,
  });
  const workout = (
    id: string,
    runId: string | null,
    day: string,
    startedAt: number,
    done = true,
  ) => ({
    id,
    runId,
    versionId: runId && 'v1',
    day,
    status: done ? ('done' as const) : ('open' as const),
    startedAt,
    endedAt: done ? startedAt + 1 : null,
    tzOffsetMin: 60,
    tz: 'Europe/Prague',
    appVersion: '1',
  });
  const set = (workoutId: string, exercise: string, reps: number, heldMs = 0) => ({
    id: `${workoutId}-s`,
    workoutId,
    planStep: 0,
    exercise,
    goal: { type: 'max' },
    reps,
    noReps: 0,
    heldMs,
    startedAt: 0,
    endedAt: 1,
  });
  const library: Library = {
    account: { id: 'local', name: 'You', image: null },
    sharing: null,
    challenges: [
      { id: 'c', owner: 'local', visibility: 'private', currentVersionId: 'v1', retiredAt: null },
      { id: 'c2', owner: 'local', visibility: 'private', currentVersionId: 'v2', retiredAt: null },
      { id: 'c3', owner: 'local', visibility: 'private', currentVersionId: 'v3', retiredAt: null },
    ],
    versions: [
      version('v1', 'Floor', 3),
      // Starts over after a missed day; and one from a newer app (an exercise this one doesn't know).
      { ...version('v2', 'Strict', 3), challengeId: 'c2', restartOnMiss: true },
      {
        ...version('v3', 'Newer', 3),
        challengeId: 'c3',
        plan: [{ steps: [{ exercise: 'muscle-up', goal: reps(5) }], rounds: 1 }],
      },
    ],
    runs: [
      run('going', false),
      run('left', true),
      { ...run('strict', false), challengeId: 'c2', startedOn: '2026-11-09' },
      { ...run('newer', false), challengeId: 'c3' },
    ],
    workouts: [
      workout('pushups', 'going', '2026-11-09', 2000),
      workout('plank', null, '2026-11-09', 1000),
      workout('nothing', null, '2026-11-09', 3000),
      workout('gave-up', 'left', '2026-11-09', 4000),
      workout('open', null, '2026-11-09', 5000, false),
      workout('before', null, '2026-11-08', 500),
      // 4 of 10 on its day 1: missed, so the run starts over today and that day is out of its stretch.
      { ...workout('short', 'strict', '2026-11-09', 6000), versionId: 'v2' },
      { ...workout('newer', 'newer', '2026-11-09', 7000), versionId: 'v3' },
    ],
    sets: [
      set('pushups', 'pushup', 8),
      set('plank', 'plank', 0, 65_000),
      set('nothing', 'squat', 0),
      set('gave-up', 'pushup', 4),
      set('open', 'squat', 5),
      set('before', 'squat', 9),
      set('short', 'pushup', 4),
      set('newer', 'pushup', 3),
    ],
  };

  const rows = dayLog(library, '2026-11-09', '2026-11-10');

  expect(rows.map(({ workoutId }) => workoutId)).toEqual([
    'plank',
    'pushups',
    'gave-up',
    'short',
    'newer',
  ]);
  expect(rows[0]).toMatchObject({
    name: 'Plank',
    free: true,
    held: true,
    heldMs: 65_000,
  });
  expect(rows[1]).toMatchObject({
    name: 'Floor',
    free: false,
    reps: 8,
    runDay: { number: 2, of: 3 },
  });
  // 'nothing' counted no rep, so the day doesn't list it. A run you left still says its day.
  expect(rows[2]).toMatchObject({ runDay: { number: 2, of: 3 } });
  // A try before a restart is numbered on its own stretch.
  expect(rows[3]).toMatchObject({ name: 'Strict', runDay: { number: 1, of: 3 } });
  // A version this app can't read: named, but no run day and no plan to play it by.
  expect(rows[4]).toMatchObject({ name: 'Newer', runDay: null, steps: null });
});
