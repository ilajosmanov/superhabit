import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { createActor } from 'xstate';

import { MAX, reps, seconds } from '@/workout/plan/plan';
import { COUNTER_VERSIONS } from '@/exercises/registry';

import { plank } from '@/exercises/__fixtures__/plank';
import {
  challenge,
  halfSquat,
  hold,
  LOG,
  modules,
  native,
  NOW,
  plan,
  pushup,
  reset,
  spoken,
  squat,
  squatTest,
} from '@/workout/__fixtures__/session';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';

vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('react-native', () => modules['react-native']);
vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('superhabit-gzip-file', () => modules['superhabit-gzip-file']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);
vi.mock('expo-constants', () => modules['expo-constants']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

const sets = () => db().select().from(schema.sets).all();

beforeAll(migrateDatabase);
afterEach(reset);

describe('workoutSession starts, stops, writes rows and finishes', () => {
  it('opens the detector on start and closes it on stop', () => {
    const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    expect(actor.getSnapshot().context.landmarker).toBe(native);
    actor.stop();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it('writes each row with wall-clock boundaries from its first counting entry', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    const { workoutId, setId } = actor.getSnapshot().context;
    vi.advanceTimersByTime(5000); // Setup time belongs to this step, before the first detector frame.
    squat();
    const view = () => sessionView(actor.getSnapshot());
    expect(sets()[0]).toMatchObject({
      id: setId,
      workoutId,
      planStep: 0,
      counterVersion: COUNTER_VERSIONS.squat,
      exercise: 'squat',
      startedAt: NOW,
      endedAt: NOW + 5000,
      goal: reps(1),
      reps: 1,
      noReps: 0,
      heldMs: 0,
    });
    vi.advanceTimersByTime(2000); // Moving the phone is outside both exercise steps.
    actor.send({ type: 'next' });
    const nextSetId = actor.getSnapshot().context.setId;
    expect(nextSetId).not.toBe(setId);
    vi.advanceTimersByTime(3000);
    pushup();
    expect(sets()[1]).toMatchObject({
      id: nextSetId,
      workoutId,
      planStep: 1,
      counterVersion: COUNTER_VERSIONS.pushup,
      exercise: 'pushup',
      startedAt: NOW + 7000,
      endedAt: NOW + 10000,
      heldMs: 0,
    });
    expect(view().results).toHaveLength(2);
    actor.send({ type: 'end' });
    expect(sets()).toHaveLength(2);
    actor.stop();
  });

  it('keeps the first counting timestamp across pause and replaces it on restart', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
    const { workoutId, setId } = actor.getSnapshot().context;
    vi.advanceTimersByTime(1000);
    squat();
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'resume' });
    vi.advanceTimersByTime(1000);
    expect(actor.getSnapshot().context).toMatchObject({ workoutId, setId, stepStartedAt: NOW });
    actor.send({ type: 'pause' });
    actor.send({ type: 'restart' });
    const restartedId = actor.getSnapshot().context.setId;
    expect(restartedId).not.toBe(setId);
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot()).results[0]).toMatchObject({
      id: restartedId,
      workoutId,
      planStep: 0,
      counterVersion: COUNTER_VERSIONS.squat,
      startedAt: NOW + 7000,
      endedAt: NOW + 7000,
      reps: 1,
    });
    actor.stop();
  });

  it('finishes a timed plank on detector time without advancing wall timers', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'plank', goal: seconds(2) }) },
    }).start();
    hold(2400, plank({}));
    const view = sessionView(actor.getSnapshot());
    expect(view).toMatchObject({
      stage: 'finished',
      reachedEnd: true,
      started: true,
      unit: 'seconds',
      heldS: 2,
      goalS: 2,
      target: Infinity,
      elapsedS: 0,
      results: [
        {
          exercise: 'plank',
          round: 1,
          goal: seconds(2),
          startedAt: NOW,
          endedAt: NOW,
          reps: 0,
          noReps: 0,
          attempts: [],
        },
      ],
    });
    expect(view.results[0].heldMs).toBeGreaterThanOrEqual(2000);
    expect(view.results[0].heldMs).toBeLessThanOrEqual(2400);
    expect(spoken()).toEqual(['Go', '2 seconds. Challenge done.']);
    actor.stop();
  });

  it('starts a fresh row timestamp when flipping inside counting', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
    const { workoutId, setId } = actor.getSnapshot().context;
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'flipCamera' });
    const flippedId = actor.getSnapshot().context.setId;
    expect(flippedId).not.toBe(setId);
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'cameraReady' });
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      reachedEnd: false,
      results: [
        { id: flippedId, workoutId, planStep: 0, startedAt: NOW + 1000, endedAt: NOW + 6000 },
      ],
    });
    actor.stop();
  });

  it('forgives a short max-hold break and a pause, then finishes on a long break', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'plank', goal: MAX }) },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    hold(1000, plank({}));
    hold(500, plank({ sag: 40 }));
    hold(500, plank({}));
    expect(view()).toMatchObject({ stage: 'counting', started: true, results: [] });
    expect(actor.getSnapshot().context.plank.noReps).toBe(0);
    const heldMs = actor.getSnapshot().context.plank.heldMs;
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(5000);
    hold(1500, plank({ sag: 40 })); // Paused frames neither break nor add held time.
    actor.send({ type: 'resume' });
    expect(view()).toMatchObject({ stage: 'counting', phase: 'waiting', results: [] });
    expect(actor.getSnapshot().context.plank.heldMs).toBe(heldMs);
    hold(500, plank({}));
    expect(view()).toMatchObject({ stage: 'counting', phase: 'active', results: [] });
    hold(1500, plank({ sag: 40 })); // Sagging says the cue and pauses the clock; MAX goes on.
    expect(view()).toMatchObject({ stage: 'counting', phase: 'active', results: [] });
    hold(1500, plank({ kneeling: true })); // Leaving the plank ends it.
    expect(view()).toMatchObject({
      stage: 'finished',
      reachedEnd: true,
      flash: 'noRep',
      results: [
        {
          exercise: 'plank',
          goal: MAX,
          noReps: 2,
          attempts: [],
          startedAt: NOW,
          endedAt: NOW + 5000,
        },
      ],
    });
    expect(spoken()).toEqual([
      'Go',
      'Keep your body straight',
      'Knees off the floor. 2 seconds. Challenge done.',
    ]);
    actor.stop();
  });

  it('distinguishes a natural finish from ending early', () => {
    vi.useFakeTimers({ now: NOW });
    const natural = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'squat', goal: reps(1) }) },
    }).start();
    squat();
    expect(sessionView(natural.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: true,
    });
    natural.stop();

    const early = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    halfSquat(); // ends standing: the start position
    halfSquat();
    early.send({ type: 'end' });
    expect(sessionView(early.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: false,
      results: [{ exercise: 'squat', reps: 0, noReps: 1 }],
      // A no-rep is something counted: back from the Done page asks before discarding it.
      counted: true,
    });
    early.stop();
  });
});
