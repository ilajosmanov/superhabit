import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createActor } from 'xstate';

import { MAX, reps, seconds } from './plan';

import { plank } from '@/exercises/__fixtures__/plank';
import {
  challenge,
  hold,
  modules,
  native,
  NOW,
  plan,
  pushup,
  reset,
  spoken,
  squat,
  squatTest,
} from './__fixtures__/session';

vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

afterEach(reset);

describe('workoutSession starts, stops, writes rows and finishes', () => {
  it('opens the detector on start and closes it on stop', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    expect(actor.getSnapshot().context.landmarker).toBe(native);
    actor.stop();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it('writes each row with wall-clock boundaries from its first counting entry', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    vi.advanceTimersByTime(5000); // Setup time belongs to this step, before the first detector frame.
    squat();
    const view = () => sessionView(actor.getSnapshot());
    expect(view().results[0]).toMatchObject({
      exercise: 'squat',
      round: 1,
      startedAt: NOW,
      endedAt: NOW + 5000,
      goal: reps(1),
      reps: 1,
      noReps: 0,
      heldMs: 0,
    });
    vi.advanceTimersByTime(2000); // Moving the phone is outside both exercise steps.
    actor.send({ type: 'next' });
    vi.advanceTimersByTime(3000);
    pushup();
    expect(view().results[1]).toMatchObject({
      exercise: 'pushup',
      startedAt: NOW + 7000,
      endedAt: NOW + 10000,
      heldMs: 0,
    });
    actor.stop();
  });

  it('keeps the first counting timestamp across pause and replaces it on restart', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    vi.advanceTimersByTime(1000);
    squat();
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'resume' });
    vi.advanceTimersByTime(1000);
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW);
    actor.send({ type: 'pause' });
    actor.send({ type: 'restart' });
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot()).results[0]).toMatchObject({
      startedAt: NOW + 7000,
      endedAt: NOW + 7000,
      reps: 1,
    });
    actor.stop();
  });

  it('finishes a timed plank on detector time without advancing wall timers', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: { challenge: plan({ exercise: 'plank', goal: seconds(2) }) },
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
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'flipCamera' });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'cameraReady' });
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      reachedEnd: false,
      results: [{ startedAt: NOW + 1000, endedAt: NOW + 6000 }],
    });
    actor.stop();
  });

  it('forgives a short max-hold break and a pause, then finishes on a long break', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: { challenge: plan({ exercise: 'plank', goal: MAX }) },
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
      input: { challenge: plan({ exercise: 'squat', goal: reps(1) }) },
    }).start();
    squat();
    expect(sessionView(natural.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: true,
    });
    natural.stop();

    const early = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    early.send({ type: 'end' });
    expect(sessionView(early.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: false,
      results: [{ exercise: 'squat' }],
    });
    early.stop();
  });
});
