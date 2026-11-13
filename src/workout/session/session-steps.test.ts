import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { sql } from 'drizzle-orm';
import { createActor } from 'xstate';

import { defineChallenge, MAX, reps, seconds, type Step } from '@/workout/plan/plan';
import { exerciseSet, ladder, session, sets as repeatedSets } from '@/workout/plan/structures';
import { EXERCISES } from '@/exercises/registry';

import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import {
  challenge,
  hold,
  LANDSCAPE,
  lockAsync,
  LOG,
  modules,
  NOW,
  plan,
  PORTRAIT,
  pushup,
  reset,
  speak,
  spoken,
  squat,
  squatTest,
  native,
} from '@/workout/__fixtures__/session';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';

vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('react-native', () => modules['react-native']);
vi.mock('reprepgo-pose', () => modules['reprepgo-pose']);
vi.mock('reprepgo-gzip-file', () => modules['reprepgo-gzip-file']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
const wakeLock = vi.hoisted(() => ({
  activateKeepAwakeAsync: vi.fn(async () => {}),
  deactivateKeepAwake: vi.fn(async () => {}),
}));
vi.mock('expo-keep-awake', () => wakeLock);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);
vi.mock('expo-constants', () => modules['expo-constants']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

const workouts = () => db().select().from(schema.workouts).all();
const sets = () => db().select().from(schema.sets).all();
const outbox = () => db().select().from(schema.outbox).all();

vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => callback(0));
beforeAll(migrateDatabase);
afterEach(reset);

describe('workoutSession moves between steps: sets, rests, countdowns, phone placement', () => {
  it('runs a squat set, waits between sets, then a push-up set', () => {
    const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'switching',
      exercise: 'squat',
      name: 'squats',
      reps: 1,
      set: 1,
      sets: 2,
      nextGoal: reps(1),
      next: { name: 'push-ups' },
    });
    expect(spoken()).toEqual(['Go', '1, set done. Next, 1 push-ups. Turn the phone sideways.']);

    pushup(); // ignored: the phone is being moved
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'switching', reps: 1 });

    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      exercise: 'pushup',
      name: 'push-ups',
      reps: 0,
      set: 2,
      next: null,
    });
    pushup();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reps: 1 });
    expect(speak).toHaveBeenLastCalledWith('1. Workout done.', expect.anything());
    expect(spoken()).toHaveLength(4); // and 'Go' for the push-up set
    actor.stop();
  });

  it('keeps each set as it finishes, in plan order, and Done saves the workout with them once', () => {
    const onLeave = vi.fn();
    const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    squat();
    // Before the last set: the squat set is already kept, so a killed app keeps it.
    expect(sets().map(({ exercise }) => exercise)).toEqual(['squat']);
    actor.send({ type: 'next' });
    pushup();
    actor.send({ type: 'save', onLeave });
    actor.send({ type: 'save', onLeave });
    actor.send({ type: 'discard', onLeave });
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(sessionView(actor.getSnapshot()).left).toBe(true);

    expect(actor.getSnapshot().matches({ finished: { decision: 'kept' } })).toBe(true);
    expect(workouts()).toEqual([expect.objectContaining({ id: 'w', status: 'done' })]);
    const counted = [expect.objectContaining({ counted: true })];
    expect(sets()).toEqual([
      expect.objectContaining({ planStep: 0, exercise: 'squat', reps: 1, attempts: counted }),
      expect.objectContaining({ planStep: 1, exercise: 'pushup', reps: 1, attempts: counted }),
    ]);
    expect(outbox()).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          workout: expect.objectContaining({
            id: 'w',
            sets: [expect.anything(), expect.anything()],
          }),
        }),
      }),
    ]);
    actor.stop();
  });

  it('is saved only once the database took it, and a failed Done can be tried again', () => {
    const onFailure = vi.fn();
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, onFailure },
    }).start();
    actor.send({ type: 'end' });
    // Nothing counted: back from the Done page leaves without asking.
    expect(sessionView(actor.getSnapshot()).counted).toBe(false);
    db().run(
      sql`create trigger full before insert on outbox begin select raise(abort, 'disk full'); end`,
    );
    try {
      actor.send({ type: 'save' });
    } finally {
      db().run(sql`drop trigger full`);
    }
    expect(sessionView(actor.getSnapshot())).toMatchObject({ left: false, failed: true });
    expect(onFailure).toHaveBeenCalledTimes(1);
    actor.send({ type: 'save' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ left: true, failed: false });
    expect(workouts()).toEqual([expect.objectContaining({ status: 'done' })]);
    actor.stop();
  });

  it('announces a seconds goal and a MAX goal when the preceding step ends', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'plank', goal: seconds(30) },
          { exercise: 'pushup', goal: MAX },
        ),
      },
    }).start();
    squat();
    expect(sessionView(actor.getSnapshot()).stage).toBe('switching');
    expect(spoken()).toEqual([
      'Go',
      '1, set done. Next, plank 30 seconds. Turn the phone sideways.',
    ]);

    actor.send({ type: 'next' });
    hold(30_500, plank({}));
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      exercise: 'pushup',
      target: Infinity,
    });
    expect(spoken()).toEqual([
      'Go',
      '1, set done. Next, plank 30 seconds. Turn the phone sideways.',
      'Go',
      '30 seconds. Next, push-ups.',
    ]);
    actor.stop();
  });

  it('shows the next exercise across a rest and counts only exercise sets', () => {
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'pushup', goal: reps(3) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({
      stage: 'counting',
      exercise: 'squat',
      set: 1,
      sets: 2,
      nextGoal: reps(3),
    });
    expect(view().next).toBe(EXERCISES.pushup);

    squat();
    expect(view()).toMatchObject({
      stage: 'resting',
      exercise: 'squat',
      set: 1,
      sets: 2,
      nextGoal: reps(3),
    });
    expect(view().next).toBe(EXERCISES.pushup);
    actor.stop();
  });

  it('walks expanded blocks and rounds, resetting the counter for each exercise step', () => {
    vi.useFakeTimers({ now: NOW });
    const repeated = defineChallenge({
      ...plan({ exercise: 'squat', goal: reps(1) }),
      session: session(
        repeatedSets({ exercise: exerciseSet('squat', 1), rounds: 2 }),
        ladder({ rungs: [2, 1], exercises: (n) => [exerciseSet('pushup', n)] }),
      ),
    });
    const actor = createActor(workoutSession, { input: { ...LOG, challenge: repeated } }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({ set: 1, sets: 4, target: 1 });
    squat();
    expect(view()).toMatchObject({ stage: 'countdown', set: 2, reps: 0 });
    vi.advanceTimersByTime(3000);
    expect(view()).toMatchObject({ stage: 'counting', set: 2, reps: 0, phase: 'waiting' });
    squat();
    expect(view()).toMatchObject({ stage: 'switching', set: 2, reps: 1 });
    actor.send({ type: 'next' });
    expect(view()).toMatchObject({ stage: 'counting', set: 3, target: 2, exercise: 'pushup' });
    pushup();
    expect(view()).toMatchObject({ stage: 'counting', reps: 1 });
    pushup();
    expect(view()).toMatchObject({ stage: 'countdown', set: 4, target: 1, reps: 0 });
    actor.send({ type: 'next' });
    pushup();
    expect(view()).toMatchObject({
      stage: 'finished',
      next: null,
      results: [
        { exercise: 'squat', goal: reps(1), reps: 1, round: 1 },
        { exercise: 'squat', goal: reps(1), reps: 1, round: 2 },
        { exercise: 'pushup', goal: reps(2), reps: 2, round: 1 },
        { exercise: 'pushup', goal: reps(1), reps: 1, round: 1 },
      ],
    });
    actor.stop();
  });

  it('counts down between the same placement without speaking 3 or counting detector frames', () => {
    vi.useFakeTimers({ now: NOW });
    const onPose = vi.fn();
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'squat', goal: reps(1) }),
        onPose,
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({
      stage: 'counting',
      countdown: null,
      restLeftS: null,
      samePlacement: true,
    });
    squat();
    expect(view()).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      unit: 'reps',
      goalS: Infinity,
      reps: 0,
      phase: 'waiting',
      set: 2,
      results: [{ exercise: 'squat', reps: 1 }],
    });
    expect(actor.getSnapshot().context.stepStartedAt).toBeNull();
    expect(spoken()).toEqual(['Go', '1. Next, 1 squats.']);
    squat();
    expect(view().reps).toBe(0);
    expect(onPose.mock.lastCall?.[1]).toEqual({ angle: null, lowest: null, joints: null });
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ stage: 'countdown', countdown: 2 });
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ stage: 'countdown', countdown: 1 });
    expect(spoken()).toEqual(['Go', '1. Next, 1 squats.', '2', '1']);
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ stage: 'counting', countdown: null, phase: 'waiting' });
    squat();
    expect(view()).toMatchObject({
      stage: 'finished',
      reachedEnd: true,
      results: [
        { startedAt: NOW, endedAt: NOW },
        { startedAt: NOW + 3000, endedAt: NOW + 3000 },
      ],
    });
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT], [PORTRAIT]]);
    actor.stop();
  });

  it('pauses when you leave the app mid-set, and stays paused until you resume', () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'squat', goal: reps(3) }) },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    actor.send({ type: 'away' });
    expect(view()).toMatchObject({ stage: 'paused', reps: 1 });
    actor.send({ type: 'back' });
    expect(view().stage).toBe('paused');
    actor.send({ type: 'resume' });
    expect(view().stage).toBe('counting');
    actor.stop();
  });

  it("doesn't count after a tap that arrives once the app has left, between sets", () => {
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'pushup', goal: reps(1) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    expect(view().stage).toBe('switching');
    actor.send({ type: 'away' });
    actor.send({ type: 'next' });
    expect(view()).toMatchObject({ stage: 'paused', exercise: 'pushup' });
    actor.stop();
  });

  it("doesn't start the next set while you're away: a rest that ends meanwhile pauses its countdown", () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'squat', goal: reps(2) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    expect(view().stage).toBe('resting');
    actor.send({ type: 'away' });
    vi.advanceTimersByTime(60_000);
    expect(view()).toMatchObject({ stage: 'paused', set: 2, reps: 0 });
    actor.send({ type: 'back' });
    actor.send({ type: 'resume' });
    expect(view().stage).toBe('counting');
    actor.stop();
  });

  it("ends with the sets so far when tracking can't start on this phone; nothing else is offered", () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'squat', goal: reps(3) }) },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    native.onFailed?.('GPU and CPU delegates failed');
    expect(view()).toMatchObject({ stage: 'paused', broken: 'tracking', reps: 1 });
    actor.send({ type: 'resume' });
    actor.send({ type: 'restart' });
    expect(view().stage).toBe('paused');
    actor.send({ type: 'end' });
    expect(view()).toMatchObject({ stage: 'finished', counted: true });
    actor.stop();
  });

  it('keeps the next set unstarted when the camera fails between sets, so End saves only what counted', () => {
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'pushup', goal: reps(1) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    expect(view().stage).toBe('switching');
    actor.send({ type: 'cameraFailed' });
    actor.send({ type: 'next' });
    expect(view()).toMatchObject({ stage: 'paused', set: 2, broken: 'camera', exercise: 'pushup' });
    actor.send({ type: 'end' });
    expect(view().stage).toBe('finished');
    expect(view().results).toHaveLength(1);
    actor.stop();
  });

  it('keeps a failed detector as the reason when the camera fails too, so nothing resumes', () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'squat', goal: reps(3) }) },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    native.onFailed?.('no delegate');
    actor.send({ type: 'cameraFailed' });
    actor.send({ type: 'resume' });
    expect(view()).toMatchObject({ stage: 'paused', broken: 'tracking' });
    actor.stop();
  });

  it('pauses when the camera stops, and a retry mounts it afresh and counts on', () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'squat', goal: reps(3) }) },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    actor.send({ type: 'cameraFailed' });
    expect(view()).toMatchObject({ stage: 'paused', broken: 'camera', cameraTry: 0 });
    actor.send({ type: 'resume' });
    expect(view()).toMatchObject({ stage: 'counting', broken: null, cameraTry: 1, reps: 1 });
    actor.stop();
  });

  it('rests on wall time, exposes the next exercise, then counts down at the deadline', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'squat', goal: reps(2) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    expect(view()).toMatchObject({
      stage: 'resting',
      restLeftS: 30,
      countdown: null,
      samePlacement: true,
      exercise: 'squat',
      reps: 1,
      set: 1,
      sets: 2,
      nextGoal: reps(2),
    });
    expect(view().next).toBe(EXERCISES.squat);
    expect(view().nextGoal).toBe(actor.getSnapshot().context.steps[2].goal);
    expect(spoken()).toEqual(['Go', '1, set done. Rest 30 seconds.']);
    squat();
    expect(view().restLeftS).toBe(30);
    expect(view().reps).toBe(1);
    actor.send({ type: 'pause' }); // Rest cannot be paused.
    vi.advanceTimersByTime(29_900);
    expect(view()).toMatchObject({ stage: 'resting', restLeftS: 1, elapsedS: 29 });
    vi.advanceTimersByTime(100);
    expect(view()).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      restLeftS: null,
      set: 2,
      reps: 0,
      elapsedS: 30,
    });
    expect(view().results).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(view().stage).toBe('counting');
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW + 33_000);
    actor.stop();
  });

  it('skips a timed rest and cancels its old deadline', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'squat', goal: MAX },
        ),
      },
    }).start();
    squat();
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'countdown', countdown: 3 });
    vi.advanceTimersByTime(29_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      results: [{ reps: 1 }],
    });
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW + 4000);
    actor.stop();
  });

  it('ends an abandoned MAX rest after ten minutes, keeping the finished set', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: MAX },
          { exercise: 'squat', goal: reps(1) },
        ),
      },
    }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'resting',
      restLeftS: null,
    });
    expect(spoken()).toEqual(['Go', '1, set done. Rest.']);
    vi.advanceTimersByTime(600_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      results: [{ reps: 1 }],
    });
    expect(sets()).toEqual([expect.objectContaining({ reps: 1 })]);
    actor.stop();
  });

  it('waits for phone placement after a rest and locks landscape only on Continue', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'pushup', goal: reps(1) },
        ),
      },
    }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'resting',
      samePlacement: false,
    });
    vi.advanceTimersByTime(30_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'switching',
      samePlacement: false,
      exercise: 'squat',
      next: { name: 'push-ups' },
      elapsedS: 30,
    });
    expect(actor.getSnapshot().context.stepS).toBe(30);
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT]]);
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      exercise: 'pushup',
    });
    expect(lockAsync).toHaveBeenLastCalledWith(LANDSCAPE);
    pushup();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: true,
      results: [
        { exercise: 'squat', planStep: 0 },
        { exercise: 'pushup', planStep: 2 },
      ],
    });
    actor.stop();
  });

  it.each(['countdown', 'resting', 'paused'] as const)(
    'ends from %s without adding an unstarted row',
    (stage) => {
      vi.useFakeTimers({ now: NOW });
      const steps: [Step, ...Step[]] =
        stage === 'resting'
          ? [
              { exercise: 'squat', goal: reps(1) },
              { exercise: 'rest', goal: seconds(30) },
              { exercise: 'squat', goal: reps(1) },
            ]
          : [
              { exercise: 'squat', goal: reps(1) },
              { exercise: 'squat', goal: reps(1) },
            ];
      const actor = createActor(workoutSession, {
        input: { ...LOG, challenge: plan(...steps) },
      }).start();
      squat();
      if (stage === 'paused') actor.send({ type: 'pause' });
      expect(sessionView(actor.getSnapshot()).stage).toBe(stage);
      actor.send({ type: 'end' });
      vi.advanceTimersByTime(60_000);
      expect(sessionView(actor.getSnapshot())).toMatchObject({
        stage: 'finished',
        reachedEnd: false,
        results: [{ exercise: 'squat', reps: 1 }],
      });
      actor.stop();
    },
  );

  it('keeps the partial exercise row when ending directly from a counting pause', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
    vi.advanceTimersByTime(2000);
    squat();
    squat();
    actor.send({ type: 'pause' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'paused', reps: 2 });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: false,
      elapsedS: 2,
      results: [
        {
          exercise: 'squat',
          goal: MAX,
          startedAt: NOW,
          endedAt: NOW + 7000,
          reps: 2,
          noReps: 0,
          attempts: [{ counted: true }, { counted: true }],
        },
      ],
    });
    actor.stop();
  });

  it('skips the rest of a countdown on next and starts counting the next step', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'squat', goal: reps(1) }),
      },
    }).start();
    squat();
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'counting', set: 2, reps: 0 });
    vi.advanceTimersByTime(3000); // The countdown timer left with the countdown state.
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reachedEnd: true });
    actor.stop();
  });

  it('pauses a countdown and resumes directly into counting with a fresh start-position wait', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'squat', goal: reps(1) }),
      },
    }).start();
    squat();
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(10_000);
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'paused',
      countdown: null,
      reps: 0,
    });
    actor.send({ type: 'resume' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'counting', phase: 'waiting' });
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW + 11_000);
    vi.advanceTimersByTime(3000); // The countdown timer was cancelled by the pause.
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reachedEnd: true });
    expect(spoken()).toEqual(['Go', '1. Next, 1 squats.', '2', 'Go', '1. Workout done.']);
    actor.stop();
  });

  it('ends a set early on next while counting', () => {
    const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ recording: false });
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'switching', reps: 0 });
    expect(speak).toHaveBeenCalledWith(
      '0, set done. Next, 1 push-ups. Turn the phone sideways.',
      expect.anything(),
    );
    actor.send({ type: 'next' });
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot()).stage).toBe('finished');
    actor.stop();
  });

  it('locks landscape only after next, and portrait when finished and on stop', () => {
    const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT]]);
    squat();
    expect(sessionView(actor.getSnapshot()).stage).toBe('switching');
    expect(lockAsync).toHaveBeenCalledTimes(1);
    actor.send({ type: 'next' });
    expect(lockAsync).toHaveBeenLastCalledWith(LANDSCAPE);
    actor.send({ type: 'end' });
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT);
    actor.stop();
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT);
    expect(lockAsync).toHaveBeenCalledTimes(4);
  });
});

it('ignores Done after Discard, leaving only once and never queuing the deleted workout', () => {
  const onLeave = vi.fn();
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  squat();
  actor.send({ type: 'end' });
  actor.send({ type: 'discard', onLeave });
  actor.send({ type: 'save', onLeave });
  actor.send({ type: 'discard', onLeave });
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(sessionView(actor.getSnapshot())).toMatchObject({ left: true, failed: false });
  expect(actor.getSnapshot().matches({ finished: { decision: 'discarded' } })).toBe(true);
  expect(workouts()).toEqual([]);
  expect(outbox()).toEqual([]);
  actor.stop();
});

it('draws paused frames as requested and hides resting frames', () => {
  const onPose = vi.fn();
  const actor = createActor(workoutSession, {
    input: {
      ...LOG,
      challenge: plan(
        { exercise: 'squat', goal: MAX },
        { exercise: 'rest', goal: MAX },
        { exercise: 'squat', goal: MAX },
      ),
      onPose,
    },
  }).start();
  try {
    actor.send({ type: 'pause' });
    hold(132, body({}));
    expect(onPose.mock.lastCall?.slice(1)).toEqual([
      { angle: null, lowest: null, joints: null },
      true,
    ]);
    actor.send({ type: 'toggleSkeleton' });
    hold(132, body({}));
    expect(onPose.mock.lastCall?.[2]).toBe(false);
    actor.send({ type: 'toggleSkeleton' });
    actor.send({ type: 'resume' });
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot()).stage).toBe('resting');
    hold(132, body({}));
    expect(onPose.mock.lastCall?.slice(1)).toEqual([
      { angle: null, lowest: null, joints: null },
      false,
    ]);
  } finally {
    actor.stop();
  }
});

it('keeps a phone-call pause resumable and rearms idle ending only on return', () => {
  vi.useFakeTimers({ now: NOW });
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  try {
    squat();
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(599_999);
    actor.send({ type: 'away' });
    vi.advanceTimersByTime(720_000);
    actor.send({ type: 'back' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'paused', reps: 1 });
    vi.advanceTimersByTime(599_999);
    expect(sessionView(actor.getSnapshot()).stage).toBe('paused');
    actor.send({ type: 'resume' });
    squat();
    actor.send({ type: 'away' });
    vi.advanceTimersByTime(720_000);
    actor.send({ type: 'back' });
    vi.advanceTimersByTime(599_999);
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'paused', reps: 2 });
    vi.advanceTimersByTime(1);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      results: [{ reps: 2 }],
    });
    expect(sets()).toEqual([expect.objectContaining({ reps: 2 })]);
  } finally {
    actor.stop();
  }
});

it('ends an idle pause through End and keeps the current set', () => {
  vi.useFakeTimers({ now: NOW });
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  squat();
  actor.send({ type: 'pause' });
  vi.advanceTimersByTime(599_999);
  expect(sessionView(actor.getSnapshot()).stage).toBe('paused');
  vi.advanceTimersByTime(1);
  expect(sessionView(actor.getSnapshot())).toMatchObject({
    stage: 'finished',
    results: [{ reps: 1 }],
  });
  expect(sets()).toEqual([expect.objectContaining({ reps: 1 })]);
  actor.stop();
});

it('gives a resumed pause a fresh idle wait', () => {
  vi.useFakeTimers({ now: NOW });
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  actor.send({ type: 'pause' });
  vi.advanceTimersByTime(599_999);
  actor.send({ type: 'resume' });
  squat();
  actor.send({ type: 'pause' });
  vi.advanceTimersByTime(599_999);
  expect(sessionView(actor.getSnapshot()).stage).toBe('paused');
  vi.advanceTimersByTime(1);
  expect(sessionView(actor.getSnapshot())).toMatchObject({
    stage: 'finished',
    results: [{ reps: 1 }],
  });
  actor.stop();
});

it('ends an abandoned phone switch without adding another set', () => {
  vi.useFakeTimers({ now: NOW });
  const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
  squat();
  vi.advanceTimersByTime(600_000);
  expect(sessionView(actor.getSnapshot())).toMatchObject({
    stage: 'finished',
    results: [{ reps: 1 }],
  });
  expect(sets()).toHaveLength(1);
  actor.stop();
});

it('ends counting that never finds the start position', () => {
  vi.useFakeTimers({ now: NOW });
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  vi.advanceTimersByTime(600_000);
  expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', counted: false });
  actor.stop();
});

it('resets counting idle time when the person returns to the start position', () => {
  vi.useFakeTimers({ now: NOW });
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  vi.advanceTimersByTime(599_999);
  hold(1500, body({}));
  vi.advanceTimersByTime(600_000);
  expect(sessionView(actor.getSnapshot()).stage).toBe('counting');
  hold(2000, { landmarks: [], worldLandmarks: [] });
  expect(sessionView(actor.getSnapshot()).phase).toBe('waiting');
  vi.advanceTimersByTime(599_999);
  expect(sessionView(actor.getSnapshot()).stage).toBe('counting');
  vi.advanceTimersByTime(1);
  expect(sessionView(actor.getSnapshot()).stage).toBe('finished');
  actor.stop();
});

it('releases keep-awake on the Done page while the session actor stays mounted', async () => {
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  await Promise.resolve();
  expect(wakeLock.activateKeepAwakeAsync).toHaveBeenCalledWith('w');
  expect(wakeLock.deactivateKeepAwake).not.toHaveBeenCalled();
  actor.send({ type: 'end' });
  await Promise.resolve();
  expect(wakeLock.deactivateKeepAwake).toHaveBeenCalledWith('w');
  actor.stop();
});
