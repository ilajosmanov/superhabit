import type { PoseDetection } from 'superhabit-pose';
import { describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';

import type { Challenge } from './challenges';
import type { Pose } from '@/exercises/registry';
import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';

const speak = vi.fn();
const lockAsync = vi.fn(async () => {});
// The fake native detector: the session sets `onResult`, the test calls it like native would.
const native: { close: () => void; onResult?: (result: PoseDetection) => void } = {
  close: vi.fn(),
};
vi.mock('superhabit-pose', () => ({ createPoseLandmarker: () => native }));
vi.mock('expo-speech', () => ({ speak, stop: vi.fn() }));
vi.mock('expo-screen-orientation', () => ({
  lockAsync,
  OrientationLock: { PORTRAIT_UP: 3, LANDSCAPE: 5 },
}));

const { workoutSession, sessionView } = await import('./session');

const PORTRAIT = 3;
const LANDSCAPE = 5;
let clock = 0;
let frames = 0;
// Holds each pose 1.5 s at detector speed, continuing the clock across calls.
const play = (...poses: Pose[]) => {
  for (const pose of poses)
    for (const end = clock + 1500; clock <= end; clock += 66, frames++)
      native.onResult?.({
        timestampMs: clock,
        ...pose,
        cameraLandmarks: [],
      });
};
const squat = () => play(body({}), body({ thigh: 70, shin: 25 }), body({}));
const pushup = () => play(plank({ elbow: 170 }), plank({ elbow: 80 }), plank({ elbow: 170 }));

const squatTest: Challenge = { name: 'Squat test', sets: [{ exercise: 'squat', reps: Infinity }] };
const challenge: Challenge = {
  name: 't',
  sets: [
    { exercise: 'squat', reps: 1 },
    { exercise: 'pushup', reps: 1 },
  ],
};

describe('workoutSession', () => {
  it('opens the detector on start and closes it on stop', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    expect(actor.getSnapshot().context.landmarker).toBe(native);
    actor.stop();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it('runs a squat set, waits between sets, then a push-up set', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'switching',
      name: 'squats',
      reps: 1,
      set: 1,
      sets: 2,
      nextReps: 1,
      next: { name: 'push-ups' },
    });
    expect(speak).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith(
      '1, set done. Next, 1 push-ups. Turn the phone sideways.',
      expect.anything(),
    );

    pushup(); // ignored: the phone is being moved
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'switching', reps: 1 });
    expect(actor.getSnapshot().context.pushup.reps).toBe(0);

    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      name: 'push-ups',
      reps: 0,
      set: 2,
      next: null,
    });
    pushup();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reps: 1 });
    expect(speak).toHaveBeenLastCalledWith('1. Challenge done.', expect.anything());
    expect(speak).toHaveBeenCalledTimes(2);
    actor.stop();
  });

  it('ends a set early on next while counting', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
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

  it('locks landscape only after next, and portrait on stop', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT]]);
    squat();
    expect(sessionView(actor.getSnapshot()).stage).toBe('switching');
    expect(lockAsync).toHaveBeenCalledTimes(1);
    actor.send({ type: 'next' });
    expect(lockAsync).toHaveBeenLastCalledWith(LANDSCAPE);
    actor.stop();
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT);
    expect(lockAsync).toHaveBeenCalledTimes(3);
  });

  it('keeps the squat test open-ended, speaks each rep and hands every frame to the screen', () => {
    const onPose = vi.fn();
    const actor = createActor(workoutSession, { input: { challenge: squatTest, onPose } }).start();
    frames = 0;
    squat();
    squat();
    expect(onPose).toHaveBeenCalledTimes(frames);
    expect(speak.mock.calls.map(([text]) => text)).toEqual(['1', '2']);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      name: 'squats',
      reps: 2,
      target: Infinity,
      sets: 1,
    });
    expect(sessionView(actor.getSnapshot()).stats).toMatch(/° · SYM \d+° · .*↓ .*↑ · LEAN \d+°/);
    actor.send({ type: 'reset' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      reps: 0,
      phase: 'waiting',
      stats: null,
    });
    actor.stop();
  });
});
