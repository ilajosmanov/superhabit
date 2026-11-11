import { files, modules, stuck, writeFile, flush } from '@/workout/__fixtures__/session';
import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor, sendTo, setup } from 'xstate';

import { workoutLog } from './log';
import { discardWorkout, logSet, saveWorkout, workoutStart } from './store';
import { writeTrace } from '@/workout/capture/recorder-file';
import { traceBuilder, type TraceInfo } from '@/storage/trace-file';
import { traceFolder, sentFolder, unreadFolder } from '@/storage/set-files';
import { reps } from '@/workout/plan/plan';
import type { StepResult } from '@/workout/plan/results';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';

vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('superhabit-gzip-file', () => modules['superhabit-gzip-file']);
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  files.clear();
  stuck.clear();
});

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
        payload: {
          workout: expect.objectContaining({
            id: 'w',
            sets: [expect.objectContaining({ id: 'w-0' })],
          }),
        },
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
    files.add('document/local/videos/kept-0-0.mp4');
    files.add('document/local/traces/private/kept-0.sht');
    discardWorkout('kept');
    expect(files).toEqual(
      new Set(['document/local/videos/kept-0-0.mp4', 'document/local/traces/private/kept-0.sht']),
    );

    expect(workouts().map(({ id }) => id)).toEqual(['kept']);
    expect(sets().map(({ workoutId }) => workoutId)).toEqual(['kept']);
  });

  it.each([
    ['reps', 1, 0],
    ['held time', 0, 1000],
    ['nothing', 0, 0],
  ])('keeps a stopped workout open only when it counted %s', (_, reps, heldMs) => {
    const log = createActor(workoutLog, { input: input('left') }).start();
    log.send({ type: 'set', set: { ...set('left', 0), reps, heldMs } });
    log.stop();
    expect(workouts().map(({ id, status }) => [id, status])).toEqual(
      reps || heldMs ? [['left', 'open']] : [],
    );
  });

  it('ignores events other than set, done and discard', () => {
    const actor = createActor(
      setup({ actors: { log: workoutLog } }).createMachine({
        invoke: { id: 'log', src: 'log', input: input('w') },
        on: { unexpected: { actions: sendTo('log', ({ event }) => event) } },
      }),
    ).start();
    const log = actor.getSnapshot().children.log;
    log?.send({ type: 'set', set: set('w', 0) });
    actor.send({ type: 'unexpected' });
    expect(workouts().map(({ status }) => status)).toEqual(['open']);
    expect(outbox()).toEqual([]);
    actor.stop();
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

it('cancels every trace write and deletes later sets even if the first trace cannot be deleted', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const info = (setId: string): TraceInfo => ({
    exercise: 'pushup',
    setId,
    counterVersion: '1.0.0',
    device: null,
    camera: null,
    takes: [],
    consent: [],
    counted: { reps: 10 },
    labels: {},
  });
  let release = () => {};
  writeFile.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  logSet(workoutStart('w', FREE), set('w', 0));
  logSet(workoutStart('w', FREE), set('w', 1));
  const writing = writeTrace(info('w-1'), traceBuilder());
  await flush();
  const first = `${traceFolder(false).uri}/w-0.sht`;
  files.add(first);
  stuck.add(first);
  for (const folder of [traceFolder(true), traceFolder(false), sentFolder(), unreadFolder()]) {
    files.add(`${folder.uri}/w-1.sht`);
  }
  discardWorkout('w');
  release();
  await writing;
  expect(files).toEqual(new Set([first]));
});
