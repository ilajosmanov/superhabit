import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor, fromPromise } from 'xstate';

import { logSet, workoutStart } from './log';
import { reps } from './plan';
import { findOpenWorkout, recovery, saveOpenWorkout } from './recovery';
import type { StepResult } from './results';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';

vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0' } } }));

const set = (planStep: number, endedAt: number): StepResult => ({
  id: `s${planStep}`,
  workoutId: 'left',
  planStep,
  counterVersion: '1.0.0',
  exercise: 'pushup',
  round: 1,
  startedAt: endedAt - 1000,
  endedAt,
  goal: reps(10),
  reps: 10,
  noReps: 0,
  heldMs: 0,
  attempts: [],
  takes: [],
  stats: null,
});

beforeAll(migrateDatabase);
beforeEach(() => {
  db().delete(schema.workouts).run();
  db().delete(schema.outbox).run();
});

describe('a workout left open', () => {
  it('is found, and saved as ended when its last set ended, with one outbox row', () => {
    expect(findOpenWorkout()).toBeNull();
    const start = workoutStart('left', { runId: null, versionId: null }, new Date(1_000));
    logSet(start, set(0, 5_000));
    logSet(start, set(2, 9_000));
    expect(findOpenWorkout()).toEqual({ id: 'left' });

    saveOpenWorkout('left');

    expect(db().select().from(schema.workouts).all()).toEqual([
      expect.objectContaining({ id: 'left', status: 'done', endedAt: 9_000 }),
    ]);
    expect(db().select().from(schema.outbox).all()).toEqual([
      expect.objectContaining({ entity: 'workout', entityId: 'left', op: 'done' }),
    ]);
    expect(findOpenWorkout()).toBeNull();
  });

  it('ends at the last set of the plan, even when the clock went back during the workout', () => {
    // Started at 10 s; the clock was set back, so the sets ended "before" the start, the last first.
    const start = workoutStart('left', { runId: null, versionId: null }, new Date(10_000));
    logSet(start, set(0, 9_000));
    logSet(start, set(2, 4_000));

    saveOpenWorkout('left');

    expect(db().select().from(schema.workouts).all()[0].endedAt).toBe(4_000);
  });

  it('blocks a new workout until it is saved', () => {
    const left = workoutStart('left', { runId: null, versionId: null });
    logSet(left, set(0, 5_000));
    const next = workoutStart('next', { runId: null, versionId: null });
    const first = { ...set(0, 6_000), id: 'n0', workoutId: 'next' };
    expect(() => logSet(next, first)).toThrow();
    saveOpenWorkout('left');
    logSet(next, first);
    expect(findOpenWorkout()).toEqual({ id: 'next' });
  });
});

describe('recovery', () => {
  const offered = (save: () => void, discard: () => void) =>
    createActor(
      recovery.provide({
        actors: {
          save: fromPromise(async () => save()),
          discard: fromPromise(async () => discard()),
        },
      }),
      { input: { id: 'left' } },
    ).start();
  const settled = () => new Promise((resolve) => setTimeout(resolve));

  it('offers Discard when Save fails, and is done once Discard goes through', async () => {
    const actor = offered(
      () => {
        throw new Error('disk full');
      },
      () => {},
    );
    actor.send({ type: 'save' });
    await settled();
    expect(actor.getSnapshot().value).toBe('saveFailed');
    actor.send({ type: 'discard' });
    await settled();
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('offers both again when Discard fails', async () => {
    const actor = offered(
      () => {},
      () => {
        throw new Error('disk I/O error');
      },
    );
    actor.send({ type: 'discard' });
    await settled();
    expect(actor.getSnapshot().value).toBe('discardFailed');
    actor.send({ type: 'save' });
    await settled();
    expect(actor.getSnapshot().status).toBe('done');
  });
});
