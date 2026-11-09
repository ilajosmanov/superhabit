import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor, setup } from 'xstate';

import { discardWorkout, logSet, saveWorkout, workoutLog, workoutStart } from './log';
import { reps } from './plan';
import type { StepResult } from './results';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';

vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.2.3' } } }));

const FREE = { runId: null, versionId: null };
const set = (workoutId: string, planStep: number): StepResult => ({
  id: `${workoutId}-${planStep}`,
  workoutId,
  planStep,
  counterVersion: '1.0.0',
  exercise: 'pushup',
  round: 1,
  startedAt: 1,
  endedAt: 2,
  goal: reps(10),
  reps: 10,
  noReps: 1,
  heldMs: 0,
  attempts: [],
  takes: [],
  stats: null,
});
const input = (workoutId: string) => ({ workoutId, target: FREE, start: new Date() });
const workouts = () => db().select().from(schema.workouts).all();
const sets = () => db().select().from(schema.sets).all();
const outbox = () => db().select().from(schema.outbox).all();

beforeAll(migrateDatabase);
beforeEach(() => {
  db().delete(schema.workouts).run();
  db().delete(schema.outbox).run();
});
afterEach(() => vi.useRealTimers());

describe('workout log', () => {
  it('opens the workout with its first set, on the local day it started', () => {
    // 00:30 in Tallinn (UTC+2 in November) is still the 9th in UTC.
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 9, 22, 30) });
    const workout = workoutStart('w', FREE);
    logSet(workout, set('w', 0));
    logSet(workout, set('w', 2));

    expect(workouts()).toEqual([
      expect.objectContaining({
        id: 'w',
        day: '2026-11-10',
        status: 'open',
        tzOffsetMin: 120,
        tz: 'Europe/Tallinn',
        appVersion: '1.2.3',
        runId: null,
      }),
    ]);
    expect(sets().map(({ planStep }) => planStep)).toEqual([0, 2]);
  });

  it('saves on Done with one outbox row holding the workout and its sets; a second Done changes nothing', () => {
    logSet(workoutStart('w', FREE), set('w', 0));
    saveWorkout('w');
    const [saved] = workouts();
    saveWorkout('w');

    expect(workouts()).toEqual([saved]);
    expect(saved.status).toBe('done');
    expect(outbox()).toEqual([
      expect.objectContaining({
        entity: 'workout',
        entityId: 'w',
        op: 'done',
        payload: expect.objectContaining({
          v: 1,
          workout: expect.objectContaining({
            id: 'w',
            sets: [expect.objectContaining({ id: 'w-0' })],
          }),
        }),
      }),
    ]);
  });

  it('opens no workout when its first set fails to write', () => {
    db().run(
      sql`create trigger full before insert on sets begin select raise(abort, 'disk full'); end`,
    );
    try {
      expect(() => logSet(workoutStart('w', FREE), set('w', 0))).toThrow();
    } finally {
      db().run(sql`drop trigger full`);
    }
    expect(workouts()).toEqual([]);
  });

  it('discards an open workout with its sets, never a saved one', () => {
    logSet(workoutStart('open', FREE), set('open', 0));
    discardWorkout('open');
    logSet(workoutStart('kept', FREE), set('kept', 0));
    saveWorkout('kept');
    discardWorkout('kept');

    expect(workouts().map(({ id }) => id)).toEqual(['kept']);
    expect(sets().map(({ workoutId }) => workoutId)).toEqual(['kept']);
  });

  it('discards the workout when the session stops without Done, and keeps it after Done', () => {
    const left = createActor(workoutLog, { input: input('left') }).start();
    left.send({ type: 'set', set: set('left', 0) });
    left.stop();
    const done = createActor(workoutLog, { input: input('done') }).start();
    done.send({ type: 'set', set: set('done', 0) });
    done.send({ type: 'done' });
    done.stop();

    expect(workouts().map(({ id, status }) => [id, status])).toEqual([['done', 'done']]);
  });
});

describe('the session log', () => {
  it('writes a set that failed again before Done, so Done keeps every set', () => {
    const log = createActor(workoutLog, { input: input('w') }).start();
    log.send({ type: 'set', set: set('w', 0) });
    db().run(
      sql`create trigger flaky before insert on sets when new.plan_step = 1 begin select raise(abort, 'disk full'); end`,
    );
    log.send({ type: 'set', set: set('w', 1) });
    log.send({ type: 'set', set: set('w', 2) });
    expect(sets().map(({ planStep }) => planStep)).toEqual([0, 2]);
    db().run(sql`drop trigger flaky`);
    log.send({ type: 'done' });
    log.stop();

    expect(workouts().map(({ status }) => status)).toEqual(['done']);
    expect(
      sets()
        .map(({ planStep }) => planStep)
        .toSorted((a, b) => a - b),
    ).toEqual([0, 1, 2]);
  });

  it('keeps the workout open, with nothing queued, when Done fails', () => {
    const failed = createActor(workoutLog, { input: input('failed') }).start();
    failed.send({ type: 'set', set: set('failed', 0) });
    db().run(
      sql`create trigger full before insert on outbox begin select raise(abort, 'disk full'); end`,
    );
    try {
      failed.send({ type: 'done' });
    } finally {
      db().run(sql`drop trigger full`);
    }
    failed.stop();
    expect(workouts().map(({ id, status }) => [id, status])).toEqual([['failed', 'open']]);
    expect(outbox()).toEqual([]);
  });
});

describe('Discard', () => {
  it('answers whether the workout is gone, so the page leaves only once it is', () => {
    const replies: string[] = [];
    const session = createActor(
      setup({ actors: { log: workoutLog } }).createMachine({
        invoke: { src: 'log', id: 'log', input: input('w') },
        on: { '*': { actions: ({ event }) => replies.push(event.type) } },
      }),
    ).start();
    const log = session.getSnapshot().children.log;
    log?.send({ type: 'set', set: set('w', 0) });
    db().run(
      sql`create trigger stuck before delete on workouts begin select raise(abort, 'disk I/O error'); end`,
    );
    try {
      log?.send({ type: 'discard' });
    } finally {
      db().run(sql`drop trigger stuck`);
    }
    expect(workouts().map(({ status }) => status)).toEqual(['open']);
    log?.send({ type: 'discard' });
    session.stop();

    expect(replies).toEqual(['logFailed', 'logDiscarded']);
    expect(workouts()).toEqual([]);
  });
});
