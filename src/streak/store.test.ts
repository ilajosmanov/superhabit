import { modules } from '@/workout/__fixtures__/session';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { keepFreezes } from './store';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';
import { reps } from '@/workout/plan/plan';
import { create } from '@/challenges/library';
import { logSet, saveWorkout, workoutStart } from '@/workout/store';

vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('reprepgo-gzip-file', () => modules['reprepgo-gzip-file']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.2.3' } } }));

/** A workout at noon on `day` with one set; saved with Done unless `open`. */
function train(day: string, { counted = 10, open = false } = {}) {
  vi.useFakeTimers({ now: new Date(`${day}T12:00:00`) });
  const workout = workoutStart(`w-${day}`, { runId: null, versionId: null });
  logSet(workout, {
    id: `s-${day}`,
    workoutId: workout.id,
    planStep: 0,
    counterVersion: '1.0.0',
    exercise: 'pushup',
    round: 1,
    startedAt: 1,
    endedAt: 2,
    goal: reps(10),
    reps: counted,
    noReps: 0,
    heldMs: 0,
    attempts: [],
    takes: [],
    stats: null,
  });
  if (!open) saveWorkout(workout.id);
  vi.useRealTimers();
}
const events = () => db().select({ id: schema.streakEvents.id }).from(schema.streakEvents).all();
const queued = () =>
  db()
    .select({ entityId: schema.outbox.entityId })
    .from(schema.outbox)
    .all()
    .filter(({ entityId }) => !entityId.startsWith('w-'));

beforeAll(migrateDatabase);
beforeEach(() => {
  db().delete(schema.workouts).run();
  db().delete(schema.streakEvents).run();
  db().delete(schema.outbox).run();
  db().delete(schema.runs).run();
  db().delete(schema.challengeVersions).run();
  db().delete(schema.challenges).run();
});

describe('keepFreezes', () => {
  it('does not spend a freeze on scheduled recovery, but spends it on the next missed training day', () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T12:00:00') });
    create({
      name: 'Recovery week',
      days: 10,
      dailyTotal: false,
      restartOnMiss: false,
      session: [{ rounds: 1, steps: [{ exercise: 'squat', goal: reps(10) }] }],
      schedule: [
        'training',
        'training',
        'training',
        'training',
        'training',
        'training',
        'training',
        'rest',
        'training',
        'rest',
      ],
    });
    vi.useRealTimers();
    for (let day = 1; day <= 7; day += 1) train(`2026-11-0${day}`);
    keepFreezes('2026-11-10', true);
    expect(events().map(({ id }) => id)).toEqual(['earned:2026-11-07', 'used:2026-11-09']);
  });
  it('writes the freeze earned and the one spent once the days are over, each queued once', () => {
    for (let day = 1; day <= 7; day += 1) train(`2026-11-0${day}`);

    keepFreezes('2026-11-09', true);
    keepFreezes('2026-11-09', true);

    const written = ['earned:2026-11-07', 'used:2026-11-08'];
    expect(events().map(({ id }) => id)).toEqual(written);
    expect(queued().map(({ entityId }) => entityId)).toEqual(written);
  });

  it("waits while yesterday's workout is still open, so a set finished after midnight keeps the day", () => {
    for (let day = 1; day <= 7; day += 1) train(`2026-11-0${day}`);
    train('2026-11-08', { open: true });

    keepFreezes('2026-11-09', true);
    saveWorkout('w-2026-11-08');
    keepFreezes('2026-11-09', true);

    expect(events().map(({ id }) => id)).toEqual(['earned:2026-11-07']);
  });

  it('counts only days with a counted rep', () => {
    for (let day = 1; day <= 6; day += 1) train(`2026-11-0${day}`);
    // Done with nothing counted is not the 7th day.
    train('2026-11-07', { counted: 0 });

    keepFreezes('2026-11-10', true);

    expect(events()).toEqual([]);
  });
});

it('does no database work while freezes are off, even before startup has migrated storage', () => {
  const prepare = vi.spyOn(db().$client, 'prepare').mockImplementation(() => {
    throw new Error('storage must stay idle while freezes are off');
  });
  try {
    expect(() => keepFreezes('2026-11-10')).not.toThrow();
  } finally {
    prepare.mockRestore();
  }
});
