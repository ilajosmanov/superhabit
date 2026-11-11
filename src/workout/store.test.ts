import { modules } from '@/workout/__fixtures__/session';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, expect, it, vi } from 'vite-plus/test';

import { logSet, saveWorkout, setIsSynced, setRows, workoutStart } from './store';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { outbox, workouts } from '@/storage/schema';
import type { StepResult } from '@/workout/plan/results';

vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('superhabit-gzip-file', () => modules['superhabit-gzip-file']);
vi.mock('expo-constants', () => modules['expo-constants']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

const set: StepResult = {
  id: 's',
  workoutId: 'w',
  planStep: 0,
  counterVersion: '1.0.0',
  exercise: 'squat',
  round: 1,
  startedAt: 100,
  endedAt: 200,
  goal: { type: 'reps', n: 10 },
  reps: 1,
  noReps: 0,
  heldMs: 0,
  attempts: [{ startMs: 10, bottomMs: 20, endMs: 30, counted: true, depth: 90, cue: null }],
  takes: [],
  stats: null,
};

beforeAll(migrateDatabase);
beforeEach(() => {
  db().delete(workouts).run();
  db().delete(outbox).run();
});

it('keeps attempts out of live rows while Done queues the full set for sync', () => {
  logSet(workoutStart('w', { runId: null, versionId: null }), set);
  expect(setRows().sync()).toEqual([
    {
      id: 's',
      workoutId: 'w',
      planStep: 0,
      exercise: 'squat',
      goal: { type: 'reps', n: 10 },
      reps: 1,
      noReps: 0,
      heldMs: 0,
      startedAt: 100,
      endedAt: 200,
    },
  ]);

  saveWorkout('w');
  expect(db().select().from(outbox).get()?.payload).toMatchObject({
    workout: {
      sets: [
        {
          id: 's',
          counterVersion: '1.0.0',
          attempts: [{ startMs: 10, bottomMs: 20, endMs: 30, counted: true, depth: 90, cue: null }],
          metrics: null,
        },
      ],
    },
  });
});

it('considers a set synced only after Done and removal of its pending or parked workout', () => {
  logSet(workoutStart('w', { runId: null, versionId: null }), set);
  expect(setIsSynced('s')).toBe(false);
  saveWorkout('w');
  expect(setIsSynced('s')).toBe(false);
  db().update(outbox).set({ lastError: 'refused' }).run();
  expect(setIsSynced('s')).toBe(false);
  db().delete(outbox).where(eq(outbox.entityId, 'w')).run();
  db()
    .insert(outbox)
    .values([
      { entity: 'workout', entityId: 'other', op: 'done', payload: {}, createdAt: 0 },
      { entity: 'challenge', entityId: 'w', op: 'create', payload: {}, createdAt: 0 },
    ])
    .run();
  expect(setIsSynced('s')).toBe(true);
  expect(setIsSynced('missing')).toBe(false);
});
